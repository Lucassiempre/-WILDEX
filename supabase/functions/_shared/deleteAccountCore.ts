export const ACCOUNT_PHOTO_BUCKET = "observation-photos";
export const STORAGE_PAGE_SIZE = 100;
export const STORAGE_DELETE_BATCH_SIZE = 100;

export type StorageEntry = {
  id?: string | null;
  name: string;
  metadata?: unknown;
};

export type StorageBucketAdapter = {
  list: (prefix: string, options: { limit: number; offset: number; sortBy: { column: string; order: "asc" } }) => Promise<{ data: StorageEntry[] | null; error: unknown }>;
  remove: (paths: string[]) => Promise<{ error: unknown }>;
};

export type DeleteAccountDependencies = {
  storage: StorageBucketAdapter;
  deleteAuthUser: (userId: string) => Promise<{ error: { message?: string; status?: number } | null }>;
};

export type DeleteAccountRequestDependencies = DeleteAccountDependencies & {
  verifyToken: (token: string) => Promise<{ userId?: string; error?: unknown }>;
};

const joinPath = (prefix: string, name: string) => prefix ? `${prefix}/${name}` : name;

export const listAllAccountObjects = async (
  storage: StorageBucketAdapter,
  userId: string,
): Promise<string[]> => {
  const pendingPrefixes = [userId];
  const objectPaths: string[] = [];

  while (pendingPrefixes.length) {
    const prefix = pendingPrefixes.shift()!;
    let offset = 0;
    for (;;) {
      const { data, error } = await storage.list(prefix, {
        limit: STORAGE_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error("storage_list_failed");
      const entries = data ?? [];
      for (const entry of entries) {
        const path = joinPath(prefix, entry.name);
        if (entry.id == null && entry.metadata == null) pendingPrefixes.push(path);
        else objectPaths.push(path);
      }
      if (entries.length < STORAGE_PAGE_SIZE) break;
      offset += STORAGE_PAGE_SIZE;
    }
  }

  return [...new Set(objectPaths)].sort();
};

export const deleteAccountData = async (
  userId: string,
  dependencies: DeleteAccountDependencies,
) => {
  const paths = await listAllAccountObjects(dependencies.storage, userId);
  for (let index = 0; index < paths.length; index += STORAGE_DELETE_BATCH_SIZE) {
    const { error } = await dependencies.storage.remove(paths.slice(index, index + STORAGE_DELETE_BATCH_SIZE));
    if (error) throw new Error("storage_delete_failed");
  }
  if ((await listAllAccountObjects(dependencies.storage, userId)).length > 0) {
    throw new Error("storage_delete_incomplete");
  }

  const { error } = await dependencies.deleteAuthUser(userId);
  if (error && error.status !== 404) throw new Error("auth_delete_failed");
  return { ok: true as const, deleted: true as const };
};

export const executeDeleteAccountRequest = async (
  input: { method: string; authorization?: string | null },
  dependencies: DeleteAccountRequestDependencies,
) => {
  if (input.method !== "POST") return { status: 405, body: { ok: false as const, error: "method_not_allowed" } };
  const token = input.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { status: 401, body: { ok: false as const, error: "not_authenticated" } };
  const verified = await dependencies.verifyToken(token);
  if (verified.error || !verified.userId) return { status: 401, body: { ok: false as const, error: "invalid_session" } };

  try {
    const result = await deleteAccountData(verified.userId, dependencies);
    return { status: 200, body: result };
  } catch (error) {
    const code = error instanceof Error ? error.message : "delete_failed";
    return { status: code.startsWith("storage_") ? 502 : 500, body: { ok: false as const, error: code } };
  }
};
