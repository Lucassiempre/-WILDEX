import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import type { Session, User } from "@supabase/supabase-js";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "../lib/supabaseClient";
import { ANDROID_AUTH_REDIRECT_URL, parseNativeOAuthCallback } from "./nativeOAuth";
import { cleanupAccountLocalData, type AccountCleanupResult } from "../services/accountLocalCleanupService";
import { requestRemoteAccountDeletion } from "../services/accountDeletionService";
import { clearStoredAuthSession } from "../services/authStorage";

export type AuthStatus = "initializing" | "signed-out" | "opening" | "waiting" | "exchanging" | "signed-in" | "signing-out" | "deleting-account" | "cancelled" | "error";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  status: AuthStatus;
  error: string | null;
  isAndroid: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccountAndData: () => Promise<AccountCleanupResult | undefined>;
  clearFeedback: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const messageForError = (error: unknown, fallback: string) => (
  error instanceof Error && error.message ? error.message : fallback
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => getSupabaseClient(), []);
  const isAndroid = Capacitor.getPlatform() === "android";
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("initializing");
  const [error, setError] = useState<string | null>(null);
  const pendingBrowser = useRef(false);
  const processingCallback = useRef(false);
  const processedCodes = useRef(new Set<string>());
  const cancellationTimer = useRef<number | undefined>(undefined);

  const clearCancellationTimer = useCallback(() => {
    if (cancellationTimer.current !== undefined) window.clearTimeout(cancellationTimer.current);
    cancellationTimer.current = undefined;
  }, []);

  const closeBrowser = useCallback(async () => {
    try {
      await Browser.close();
    } catch {
      // The browser may already be closed after Android returns through the deep link.
    }
  }, []);

  const handleCallbackUrl = useCallback(async (url: string) => {
    const callback = parseNativeOAuthCallback(url);
    if (callback.kind === "ignore") return false;

    clearCancellationTimer();
    pendingBrowser.current = false;

    if (callback.kind === "cancelled") {
      setError(null);
      setStatus("cancelled");
      await closeBrowser();
      return true;
    }
    if (callback.kind === "error") {
      setError(callback.message);
      setStatus("error");
      await closeBrowser();
      return true;
    }
    if (processedCodes.current.has(callback.code)) return true;

    processedCodes.current.add(callback.code);
    processingCallback.current = true;
    setError(null);
    setStatus("exchanging");
    await closeBrowser();

    try {
      const { data, error: exchangeError } = await client.auth.exchangeCodeForSession(
        callback.code,
        callback.flowId ? { flowId: callback.flowId } : undefined,
      );
      if (exchangeError) throw exchangeError;
      setSession(data.session);
      setStatus("signed-in");
    } catch (exchangeError) {
      processedCodes.current.delete(callback.code);
      setError(messageForError(exchangeError, "No se pudo completar el inicio de sesión."));
      setStatus("error");
    } finally {
      processingCallback.current = false;
    }
    return true;
  }, [clearCancellationTimer, client, closeBrowser]);

  useEffect(() => {
    let active = true;
    const handles: PluginListenerHandle[] = [];
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setStatus(nextSession ? "signed-in" : "signed-out");
      setError(null);
    });

    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError("No se pudo restaurar la sesión guardada.");
        setStatus("error");
        return;
      }
      setSession(data.session);
      setStatus(data.session ? "signed-in" : "signed-out");
    });

    if (isAndroid) {
      void CapacitorApp.addListener("appUrlOpen", ({ url }) => {
        void handleCallbackUrl(url);
      }).then((handle) => {
        if (active) handles.push(handle);
        else void handle.remove();
      });

      void Browser.addListener("browserFinished", () => {
        if (!pendingBrowser.current || processingCallback.current) return;
        clearCancellationTimer();
        cancellationTimer.current = window.setTimeout(() => {
          if (!pendingBrowser.current || processingCallback.current) return;
          pendingBrowser.current = false;
          setError(null);
          setStatus("cancelled");
        }, 500);
      }).then((handle) => {
        if (active) handles.push(handle);
        else void handle.remove();
      });

      void CapacitorApp.getLaunchUrl().then((result) => {
        if (active && result?.url) void handleCallbackUrl(result.url);
      });
    }

    return () => {
      active = false;
      subscription.unsubscribe();
      clearCancellationTimer();
      handles.forEach((handle) => void handle.remove());
    };
  }, [clearCancellationTimer, client, handleCallbackUrl, isAndroid]);

  const signInWithGoogle = useCallback(async () => {
    if (!isAndroid) {
      setError("El inicio de sesión con Google está disponible en la aplicación Android.");
      setStatus("error");
      return;
    }

    clearCancellationTimer();
    setError(null);
    setStatus("opening");
    pendingBrowser.current = false;

    try {
      const { data, error: oauthError } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: ANDROID_AUTH_REDIRECT_URL,
          skipBrowserRedirect: true,
        },
      });
      if (oauthError) throw oauthError;
      if (!data.url) throw new Error("Supabase no devolvió la URL de autorización.");

      pendingBrowser.current = true;
      setStatus("waiting");
      await Browser.open({ url: data.url });
    } catch (oauthError) {
      pendingBrowser.current = false;
      setError(messageForError(oauthError, "No se pudo abrir Google para iniciar sesión."));
      setStatus("error");
    }
  }, [clearCancellationTimer, client, isAndroid]);

  const signOut = useCallback(async () => {
    setError(null);
    setStatus("signing-out");
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) {
      setError(messageForError(signOutError, "No se pudo cerrar la sesión."));
      setStatus(session ? "signed-in" : "error");
      return;
    }
    setSession(null);
    setStatus("signed-out");
  }, [client, session]);

  const deleteAccountAndData = useCallback(async () => {
    const userId = session?.user.id;
    if (!userId) {
      setError("Necesitás una sesión válida para eliminar la cuenta.");
      setStatus("error");
      return undefined;
    }

    setError(null);
    setStatus("deleting-account");
    try {
      await requestRemoteAccountDeletion();
    } catch (deletionError) {
      setError(messageForError(deletionError, "No se pudo eliminar la cuenta. Tus datos locales se conservaron."));
      setStatus("signed-in");
      return undefined;
    }

    let cleanup: AccountCleanupResult = { warnings: [] };
    try {
      cleanup = await cleanupAccountLocalData(userId);
    } catch {
      cleanup.warnings.push("La cuenta remota fue eliminada, pero quedaron datos locales por limpiar en este dispositivo.");
    }

    try {
      await client.auth.signOut({ scope: "local" });
    } catch {
      // The remote user no longer exists; Secure Storage is cleared explicitly below.
    }
    try {
      await clearStoredAuthSession();
    } catch {
      cleanup.warnings.push("No se pudo confirmar la limpieza de la sesión cifrada local.");
    }
    setSession(null);
    setError(cleanup.warnings[0] ?? null);
    setStatus("signed-out");
    return cleanup;
  }, [client, session]);

  const clearFeedback = useCallback(() => {
    setError(null);
    setStatus(session ? "signed-in" : "signed-out");
  }, [session]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    status,
    error,
    isAndroid,
    signInWithGoogle,
    signOut,
    deleteAccountAndData,
    clearFeedback,
  }), [clearFeedback, deleteAccountAndData, error, isAndroid, session, signInWithGoogle, signOut, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe utilizarse dentro de AuthProvider.");
  return context;
};
