import { CircleAlert, LoaderCircle, Trash2, X } from "lucide-react";
import { useState } from "react";

export type DeleteAccountDialogProps = {
  open: boolean;
  busy: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export const isDeleteConfirmationValid = (value: string) => value === "ELIMINAR";

export function DeleteAccountDialog({ open, busy, error, onCancel, onConfirm }: DeleteAccountDialogProps) {
  const [confirmation, setConfirmation] = useState("");
  if (!open) return null;
  const confirmed = isDeleteConfirmationValid(confirmation);

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/65 p-3 md:place-items-center" role="presentation">
      <section className="w-full max-w-md rounded-lg border border-danger/40 bg-surface p-5 shadow-phone" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-danger/15 text-danger"><Trash2 size={19} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="delete-account-title" className="text-lg font-bold text-primary">Eliminar cuenta y datos</h2>
            <p className="mt-2 text-sm leading-5 text-secondary">Esta acción elimina permanentemente tu cuenta Wildex, perfil, observaciones y fotografías sincronizadas, progreso, XP, insignias, desafíos y datos de sincronización.</p>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-secondary disabled:opacity-50" aria-label="Cancelar"><X size={20} aria-hidden="true" /></button>
        </div>

        <label className="mt-5 block text-sm font-bold text-primary" htmlFor="delete-account-confirmation">Escribí ELIMINAR para confirmar</label>
        <input id="delete-account-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} autoCapitalize="characters" autoComplete="off" spellCheck={false} className="mt-2 min-h-12 w-full rounded-lg border border-line bg-card px-3 text-primary" />
        {error ? <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-danger" role="alert"><CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p> : null}
        <div className="mt-5 grid gap-2">
          <button type="button" onClick={onConfirm} disabled={!confirmed || busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-danger px-4 text-sm font-bold text-brand-deep disabled:opacity-40">{busy ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Trash2 size={17} aria-hidden="true" />}Eliminar permanentemente</button>
          <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-lg border border-line bg-card px-4 text-sm font-bold text-primary disabled:opacity-50">Cancelar</button>
        </div>
      </section>
    </div>
  );
}
