import { CircleAlert, Link2, LoaderCircle, LogIn, LogOut, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import type { AuthStatus } from "../auth/AuthProvider";
import { useAuth } from "../auth/AuthProvider";
import type { InitialSyncProgress, ProfileResolution } from "../services/initialSyncService";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

type AccountSummary = { name?: string; email?: string };

type AuthAccountViewProps = {
  account: AccountSummary | null;
  status: AuthStatus;
  error: string | null;
  isAndroid: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onDismiss: () => void;
  canDeleteAccount?: boolean;
  onOpenDelete?: () => void;
  anonymousProgressPending?: boolean;
  progressLink?: ProgressLinkViewModel;
};

export type ProgressLinkViewModel = {
  available: boolean;
  busy: boolean;
  resumable: boolean;
  completed: boolean;
  profileConflict: boolean;
  progress?: InitialSyncProgress;
  error?: string;
  onStart: () => void;
  onResolveProfile: (resolution: ProfileResolution) => void;
  photoSync?: {
    busy: boolean;
    current: number;
    total: number;
    failed: number;
    message?: string;
  };
};

const busyStatuses: AuthStatus[] = ["initializing", "opening", "waiting", "exchanging", "signing-out", "deleting-account"];

const loadingLabel: Partial<Record<AuthStatus, string>> = {
  initializing: "Restaurando sesión...",
  opening: "Abriendo Google...",
  waiting: "Esperando a Google...",
  exchanging: "Completando inicio de sesión...",
  "signing-out": "Cerrando sesión...",
  "deleting-account": "Eliminando cuenta y datos...",
};

export function AuthAccountView({ account, status, error, isAndroid, onSignIn, onSignOut, onDismiss, canDeleteAccount = false, onOpenDelete, anonymousProgressPending = false, progressLink }: AuthAccountViewProps) {
  const busy = busyStatuses.includes(status);

  return (
    <section aria-labelledby="wildex-account-title">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck size={19} className="text-accent" aria-hidden="true" />
        <h2 id="wildex-account-title" className="text-lg font-bold text-primary">Cuenta Wildex</h2>
      </div>
      <div className="rounded-lg border border-line bg-surface p-4">
        {account ? (
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent/15 text-accent"><UserRound size={21} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-primary">{account.name || "Cuenta de Google"}</p>
              {account.email ? <p className="truncate text-xs text-secondary">{account.email}</p> : null}
            </div>
          </div>
        ) : (
          <p className="text-sm leading-5 text-secondary">Conectá tu cuenta para preparar el respaldo futuro de Wildex.</p>
        )}

        {busy ? <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-secondary" role="status"><LoaderCircle size={16} className="animate-spin" aria-hidden="true" />{loadingLabel[status]}</p> : null}
        {account && anonymousProgressPending && progressLink?.available ? (
          <div className="mt-3 rounded-lg border border-accent/30 bg-accent/10 p-3">
            <p className="text-xs font-bold text-primary">Tenés progreso guardado en este dispositivo</p>
            <p className="mt-1 text-xs leading-5 text-secondary">Vinculalo voluntariamente con esta cuenta. El respaldo anónimo y sus fotografías permanecerán en el dispositivo.</p>
            {progressLink.progress ? <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-primary" role="status">{progressLink.busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <CircleAlert size={15} className="text-accent" aria-hidden="true" />}{progressLink.progress.message}</p> : null}
            {progressLink.error ? <p className="mt-2 text-xs leading-5 text-danger" role="alert">{progressLink.error}</p> : null}
            {progressLink.profileConflict ? (
              <div className="mt-3 grid gap-2">
                <p className="text-xs leading-5 text-primary">La cuenta ya tiene un perfil diferente. Las observaciones confirmadas están seguras. Elegí qué perfil conservar.</p>
                <button type="button" onClick={() => progressLink.onResolveProfile("remote")} disabled={progressLink.busy} className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-bold text-primary disabled:opacity-60">Conservar perfil de la cuenta</button>
                <button type="button" onClick={() => progressLink.onResolveProfile("local")} disabled={progressLink.busy} className="min-h-11 rounded-lg bg-accent px-3 text-xs font-bold text-brand-deep disabled:opacity-60">Usar perfil del dispositivo</button>
              </div>
            ) : (
              <button type="button" onClick={progressLink.onStart} disabled={progressLink.busy} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-bold text-brand-deep disabled:opacity-60"><Link2 size={17} aria-hidden="true" />{progressLink.resumable ? "Continuar vinculación" : "Vincular progreso con mi cuenta"}</button>
            )}
          </div>
        ) : null}
        {account && progressLink?.completed ? <p className="mt-3 rounded-lg border border-accent/30 bg-accent/10 p-3 text-xs font-semibold text-primary" role="status">Progreso vinculado correctamente.</p> : null}
        {account && progressLink?.photoSync?.message ? (
          <p className={`mt-3 flex items-center gap-2 rounded-lg border p-3 text-xs font-semibold ${progressLink.photoSync.failed ? "border-gold/35 bg-gold/10 text-primary" : "border-accent/30 bg-accent/10 text-primary"}`} role="status">
            {progressLink.photoSync.busy ? <LoaderCircle size={15} className="shrink-0 animate-spin" aria-hidden="true" /> : <CircleAlert size={15} className="shrink-0 text-accent" aria-hidden="true" />}
            {progressLink.photoSync.message}
          </p>
        ) : null}
        {status === "cancelled" ? <div className="mt-3 flex items-start justify-between gap-3 text-xs text-secondary" role="status"><span>Inicio de sesión cancelado.</span><button type="button" onClick={onDismiss} className="font-bold text-accent">Cerrar</button></div> : null}
        {error ? <div className="mt-3 flex items-start gap-2 text-xs text-danger" role="alert"><CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><span className="flex-1">{error}</span><button type="button" onClick={onDismiss} className="font-bold">Cerrar</button></div> : null}

        {account ? (
          <div className="mt-4 grid gap-2">
            <button type="button" onClick={onSignOut} disabled={busy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-card px-4 text-sm font-bold text-primary disabled:opacity-60"><LogOut size={18} aria-hidden="true" />Cerrar sesión</button>
            <button type="button" onClick={onOpenDelete} disabled={busy || !canDeleteAccount || !onOpenDelete} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-danger/50 px-4 text-sm font-bold text-danger disabled:opacity-60"><Trash2 size={17} aria-hidden="true" />Eliminar cuenta y datos</button>
          </div>
        ) : (
          <button type="button" onClick={onSignIn} disabled={busy || !isAndroid} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-bold text-brand-deep disabled:opacity-60"><LogIn size={18} aria-hidden="true" />Continuar con Google</button>
        )}
        {!isAndroid ? <p className="mt-2 text-center text-[11px] text-secondary">Disponible en la aplicación Android.</p> : null}
      </div>
    </section>
  );
}

export function AuthAccountPanel({ anonymousProgressPending = false, progressLink }: { anonymousProgressPending?: boolean; progressLink?: ProgressLinkViewModel }) {
  const { user, status, error, isAndroid, signInWithGoogle, signOut, deleteAccountAndData, clearFeedback } = useAuth();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const metadataName = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
  const account = user ? {
    name: typeof metadataName === "string" ? metadataName : undefined,
    email: user.email,
  } : null;

  const confirmDelete = async () => {
    setDeleteError(null);
    const deleted = Boolean(await deleteAccountAndData());
    if (deleted) setDeleteDialogOpen(false);
    else setDeleteError("No se pudo completar la eliminación. Tus datos locales se conservaron y podés reintentar.");
  };

  return <>
    <AuthAccountView account={account} status={status} error={error} isAndroid={isAndroid} anonymousProgressPending={anonymousProgressPending} progressLink={progressLink} onSignIn={() => void signInWithGoogle()} onSignOut={() => void signOut()} canDeleteAccount onOpenDelete={() => { setDeleteError(null); setDeleteDialogOpen(true); }} onDismiss={clearFeedback} />
    <DeleteAccountDialog open={deleteDialogOpen} busy={status === "deleting-account"} error={deleteError} onCancel={() => { if (status !== "deleting-account") setDeleteDialogOpen(false); }} onConfirm={() => void confirmDelete()} />
  </>;
}
