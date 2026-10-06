import { getSupabaseClient } from "../lib/supabaseClient";

export type DeleteAccountResult = {
  ok: true;
  deleted: true;
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export const requestRemoteAccountDeletion = async (): Promise<DeleteAccountResult> => {
  const client = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError || !sessionData.session?.user) throw new Error("Tu sesión venció. Iniciá sesión nuevamente antes de eliminar la cuenta.");

  const { data, error } = await client.functions.invoke<DeleteAccountResult>("delete-account", {
    body: {},
  });
  if (error) throw new Error(`No se pudo eliminar la cuenta: ${errorMessage(error)}`);
  if (!data?.ok || data.deleted !== true) throw new Error("El servidor no confirmó la eliminación de la cuenta.");
  return data;
};
