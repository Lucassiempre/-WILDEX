import type { ExplorerProfile, ExplorerState } from "../types";
import {
  EXPLORER_STATE_V1_KEY,
  EXPLORER_STATE_V2_KEY,
  initialExplorerState,
  parseExplorerState,
  serializeExplorerState,
} from "./storageService";
import {
  createDefaultProfile,
  EXPLORER_PROFILE_V1_KEY,
  normalizeProfile,
} from "./profileService";

export const STORAGE_V3_DATASET_ID_KEY = "wildex-storage-v3-dataset-id";
export const STORAGE_V3_MIGRATION_KEY = "wildex-storage-v3-migration-v2";
export const STORAGE_V3_STATE_PREFIX = "wildex-explorer-state-v3:";
export const STORAGE_V3_PROFILE_PREFIX = "wildex-explorer-profile-v3:";

export type LocalIdentityNamespace = `anonymous:${string}` | `account:${string}`;

export type StorageLike = Pick<Storage, "getItem" | "setItem"> & Partial<Pick<Storage, "key" | "length" | "removeItem">>;

type StorageDocument<T> = {
  schemaVersion: 3;
  namespace: LocalIdentityNamespace;
  kind: "explorer-state" | "explorer-profile";
  updatedAt: string;
  data: T;
};

export type StorageV3Migration = {
  schemaVersion: 3;
  datasetId: string;
  namespace: LocalIdentityNamespace;
  status: "complete";
  stateSourceKey: typeof EXPLORER_STATE_V2_KEY | typeof EXPLORER_STATE_V1_KEY | "empty";
  profileSourceKey: typeof EXPLORER_PROFILE_V1_KEY | "default";
  completedAt: string;
};

export type StorageV3Context = {
  datasetId: string;
  anonymousNamespace: LocalIdentityNamespace;
  migrationComplete: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const stateKey = (namespace: LocalIdentityNamespace) => `${STORAGE_V3_STATE_PREFIX}${namespace}`;
const profileKey = (namespace: LocalIdentityNamespace) => `${STORAGE_V3_PROFILE_PREFIX}${namespace}`;

const safeGetItem = (storage: StorageLike, key: string) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const readDocument = <T>(
  storage: StorageLike,
  key: string,
  namespace: LocalIdentityNamespace,
  kind: StorageDocument<T>["kind"],
): StorageDocument<T> | undefined => {
  try {
    const raw = safeGetItem(storage, key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StorageDocument<T>>;
    if (parsed.schemaVersion !== 3 || parsed.namespace !== namespace || parsed.kind !== kind || !("data" in parsed)) return undefined;
    return parsed as StorageDocument<T>;
  } catch {
    return undefined;
  }
};

const writeDocument = <T>(
  storage: StorageLike,
  key: string,
  namespace: LocalIdentityNamespace,
  kind: StorageDocument<T>["kind"],
  data: T,
  now: Date,
) => {
  try {
    storage.setItem(key, JSON.stringify({ schemaVersion: 3, namespace, kind, updatedAt: now.toISOString(), data } satisfies StorageDocument<T>));
    return true;
  } catch {
    return false;
  }
};

const recoverDatasetId = (storage: StorageLike) => {
  if (typeof storage.length !== "number" || typeof storage.key !== "function") return undefined;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(`${STORAGE_V3_STATE_PREFIX}anonymous:`)) continue;
    const candidate = key.slice(`${STORAGE_V3_STATE_PREFIX}anonymous:`.length);
    if (UUID_PATTERN.test(candidate)) return candidate;
  }
  return undefined;
};

const ensureDatasetId = (storage: StorageLike, createUuid: () => string) => {
  const stored = safeGetItem(storage, STORAGE_V3_DATASET_ID_KEY);
  if (stored && UUID_PATTERN.test(stored)) return stored;
  const datasetId = recoverDatasetId(storage) ?? createUuid();
  if (!UUID_PATTERN.test(datasetId)) throw new Error("No se pudo generar un datasetId UUID válido.");
  try {
    storage.setItem(STORAGE_V3_DATASET_ID_KEY, datasetId);
  } catch {
    // The caller receives migrationComplete=false and can warn about unavailable storage.
  }
  return datasetId;
};

const readLegacyState = (storage: StorageLike): {
  state: ExplorerState;
  sourceKey: typeof EXPLORER_STATE_V2_KEY | typeof EXPLORER_STATE_V1_KEY | "empty";
} => {
  for (const key of [EXPLORER_STATE_V2_KEY, EXPLORER_STATE_V1_KEY] as const) {
    const raw = safeGetItem(storage, key);
    if (!raw) continue;
    const state = parseExplorerState(raw);
    if (state) return { state, sourceKey: key };
  }
  return { state: initialExplorerState, sourceKey: "empty" as const };
};

const readLegacyProfile = (storage: StorageLike, now: Date): {
  profile: ExplorerProfile;
  sourceKey: typeof EXPLORER_PROFILE_V1_KEY | "default";
} => {
  try {
    const raw = safeGetItem(storage, EXPLORER_PROFILE_V1_KEY);
    if (raw) return { profile: normalizeProfile(JSON.parse(raw), now), sourceKey: EXPLORER_PROFILE_V1_KEY };
  } catch {
    // Preserve the source and use a valid default profile in v3.
  }
  return { profile: createDefaultProfile(now), sourceKey: "default" as const };
};

const hasCompleteMigrationMarker = (storage: StorageLike, datasetId: string, namespace: LocalIdentityNamespace) => {
  try {
    const raw = safeGetItem(storage, STORAGE_V3_MIGRATION_KEY);
    if (!raw) return false;
    const marker = JSON.parse(raw) as Partial<StorageV3Migration>;
    return marker.schemaVersion === 3
      && marker.datasetId === datasetId
      && marker.namespace === namespace
      && marker.status === "complete";
  } catch {
    return false;
  }
};

export const initializeLocalStorageV3 = ({
  storage = localStorage,
  createUuid = () => crypto.randomUUID(),
  now = new Date(),
}: {
  storage?: StorageLike;
  createUuid?: () => string;
  now?: Date;
} = {}): StorageV3Context => {
  const datasetId = ensureDatasetId(storage, createUuid);
  const anonymousNamespace = `anonymous:${datasetId}` as const;
  const existingState = readDocument<ExplorerState>(storage, stateKey(anonymousNamespace), anonymousNamespace, "explorer-state");
  const existingProfile = readDocument<ExplorerProfile>(storage, profileKey(anonymousNamespace), anonymousNamespace, "explorer-profile");
  const legacyState = readLegacyState(storage);
  const legacyProfile = readLegacyProfile(storage, now);

  const stateWritten = existingState
    ? true
    : writeDocument(storage, stateKey(anonymousNamespace), anonymousNamespace, "explorer-state", legacyState.state, now);
  const profileWritten = existingProfile
    ? true
    : writeDocument(storage, profileKey(anonymousNamespace), anonymousNamespace, "explorer-profile", legacyProfile.profile, now);
  const stateVerified = Boolean(readDocument(storage, stateKey(anonymousNamespace), anonymousNamespace, "explorer-state"));
  const profileVerified = Boolean(readDocument(storage, profileKey(anonymousNamespace), anonymousNamespace, "explorer-profile"));
  const datasetVerified = safeGetItem(storage, STORAGE_V3_DATASET_ID_KEY) === datasetId;
  const migrationComplete = stateWritten && profileWritten && stateVerified && profileVerified && datasetVerified;

  if (migrationComplete) {
    if (hasCompleteMigrationMarker(storage, datasetId, anonymousNamespace)) {
      return { datasetId, anonymousNamespace, migrationComplete: true };
    }
    const marker: StorageV3Migration = {
      schemaVersion: 3,
      datasetId,
      namespace: anonymousNamespace,
      status: "complete",
      stateSourceKey: legacyState.sourceKey,
      profileSourceKey: legacyProfile.sourceKey,
      completedAt: now.toISOString(),
    };
    try {
      storage.setItem(STORAGE_V3_MIGRATION_KEY, JSON.stringify(marker));
      if (!hasCompleteMigrationMarker(storage, datasetId, anonymousNamespace)) {
        return { datasetId, anonymousNamespace, migrationComplete: false };
      }
    } catch {
      return { datasetId, anonymousNamespace, migrationComplete: false };
    }
  }

  return { datasetId, anonymousNamespace, migrationComplete };
};

export const namespaceForAccount = (userId: string): LocalIdentityNamespace => {
  if (!UUID_PATTERN.test(userId)) throw new Error("El userId de la cuenta debe ser un UUID válido.");
  return `account:${userId}`;
};

export const ensureStorageV3Namespace = (
  namespace: LocalIdentityNamespace,
  storage: StorageLike = localStorage,
  now = new Date(),
) => {
  if (!readDocument(storage, stateKey(namespace), namespace, "explorer-state")) {
    writeDocument(storage, stateKey(namespace), namespace, "explorer-state", initialExplorerState, now);
  }
  if (!readDocument(storage, profileKey(namespace), namespace, "explorer-profile")) {
    writeDocument(storage, profileKey(namespace), namespace, "explorer-profile", createDefaultProfile(now), now);
  }
};

export const loadExplorerStateV3 = (
  namespace: LocalIdentityNamespace,
  storage: StorageLike = localStorage,
): ExplorerState => {
  const document = readDocument<unknown>(storage, stateKey(namespace), namespace, "explorer-state");
  return document ? parseExplorerState(JSON.stringify(document.data)) ?? initialExplorerState : initialExplorerState;
};

export const saveExplorerStateV3 = (
  namespace: LocalIdentityNamespace,
  state: ExplorerState,
  storage: StorageLike = localStorage,
  now = new Date(),
) => writeDocument(storage, stateKey(namespace), namespace, "explorer-state", JSON.parse(serializeExplorerState(state)) as ExplorerState, now);

export const loadExplorerProfileV3 = (
  namespace: LocalIdentityNamespace,
  storage: StorageLike = localStorage,
): ExplorerProfile => {
  const document = readDocument<unknown>(storage, profileKey(namespace), namespace, "explorer-profile");
  return document ? normalizeProfile(document.data) : createDefaultProfile();
};

export const saveExplorerProfileV3 = (
  namespace: LocalIdentityNamespace,
  profile: ExplorerProfile,
  storage: StorageLike = localStorage,
  now = new Date(),
) => writeDocument(storage, profileKey(namespace), namespace, "explorer-profile", normalizeProfile(profile, now), now);

export const hasAnonymousProgressV3 = (
  context: StorageV3Context,
  storage: StorageLike = localStorage,
) => {
  const state = loadExplorerStateV3(context.anonymousNamespace, storage);
  return state.discoveries.length > 0
    || state.xp > 0
    || state.awardedCategoryBonuses.length > 0
    || state.claimedChallengeIds.length > 0
    || state.earnedBadgeIds.length > 0
    || state.badgeAwards.length > 0;
};

export const listStorageV3Namespaces = (storage: StorageLike = localStorage): LocalIdentityNamespace[] => {
  if (typeof storage.length !== "number" || typeof storage.key !== "function") return [];
  const namespaces = new Set<LocalIdentityNamespace>();
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(STORAGE_V3_STATE_PREFIX)) continue;
    const namespace = key.slice(STORAGE_V3_STATE_PREFIX.length);
    if (namespace.startsWith("anonymous:") || namespace.startsWith("account:")) {
      namespaces.add(namespace as LocalIdentityNamespace);
    }
  }
  return [...namespaces];
};

export const photoReferencesForNamespace = (
  namespace: LocalIdentityNamespace,
  storage: StorageLike = localStorage,
) => new Set(loadExplorerStateV3(namespace, storage).discoveries
  .flatMap((discovery) => discovery.photoRef ? [discovery.photoRef] : []));

export const removeAccountNamespaceV3 = (
  userId: string,
  storage: StorageLike = localStorage,
) => {
  if (typeof storage.removeItem !== "function") throw new Error("El almacenamiento local no permite eliminar la cuenta.");
  const namespace = namespaceForAccount(userId);
  storage.removeItem(stateKey(namespace));
  storage.removeItem(profileKey(namespace));
};
