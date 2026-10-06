import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseConfig, type SupabasePublicEnvironment } from "../config/supabaseConfig";

export const DELETE_ACCOUNT_STORAGE_KEY = "wildex-delete-account-auth-v1";

export const isDeleteAccountConfirmationValid = (value: string) => value === "ELIMINAR";

export const buildDeleteAccountRedirectUrl = (origin: string, baseUrl: string) => {
  const normalizedBase = baseUrl.startsWith("/") ? baseUrl : "/";
  return new URL(`${normalizedBase.replace(/\/?$/, "/")}delete-account/`, `${origin}/`).toString();
};

export const createDeleteAccountWebClient = (
  environment: SupabasePublicEnvironment,
  storage: Storage = window.sessionStorage,
) => {
  const config = readSupabaseConfig(environment);
  return createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      storage,
      storageKey: DELETE_ACCOUNT_STORAGE_KEY,
    },
  });
};

export const beginGoogleDeleteAccountLogin = async (
  client: SupabaseClient,
  redirectTo: string,
) => {
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error("Supabase no devolvió una URL de autenticación.");
  window.location.assign(data.url);
};

export const exchangeDeleteAccountOAuthReturn = async (
  client: SupabaseClient,
  currentUrl: string,
): Promise<Session | null> => {
  const url = new URL(currentUrl);
  const oauthError = url.searchParams.get("error") ?? url.searchParams.get("error_code");
  if (oauthError) throw new Error("Google no pudo completar el inicio de sesión.");

  const code = url.searchParams.get("code");
  if (!code) return null;
  const flowId = url.searchParams.get("sb_flow_id") ?? undefined;
  const { data, error } = await client.auth.exchangeCodeForSession(
    code,
    flowId ? { flowId } : undefined,
  );
  if (error) throw error;
  return data.session;
};

export const deleteAuthenticatedWildexAccount = async (client: SupabaseClient) => {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError || !sessionData.session?.user) throw new Error("La sesión no es válida. Volvé a iniciar sesión.");

  const { data, error } = await client.functions.invoke<{ ok?: boolean; deleted?: boolean }>("delete-account", {
    method: "POST",
  });
  if (error) throw new Error("No se pudo completar la eliminación. Intentá nuevamente.");
  if (!data?.ok || data.deleted !== true) throw new Error("El servidor no confirmó la eliminación.");
};

export const clearDeleteAccountBrowserSession = async (
  client: SupabaseClient,
  storage: Storage = window.sessionStorage,
) => {
  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // The remote account no longer exists; the temporary browser state is cleared below.
  }
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(DELETE_ACCOUNT_STORAGE_KEY)) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
};
