import type { InitialSyncManifest } from "./initialSyncManifest";

export const INITIAL_SYNC_CHECKPOINT_PREFIX = "wildex-initial-sync-v1:";

export type InitialSyncItemStatus = "pending" | "confirmed" | "conflict";
export type InitialSyncStatus = "prepared" | "running" | "profile-conflict" | "failed" | "verifying" | "complete";

export type InitialSyncCheckpoint = {
  schemaVersion: 1;
  datasetId: string;
  userId: string;
  manifestHash: string;
  manifest: InitialSyncManifest;
  importId?: string;
  status: InitialSyncStatus;
  observations: Array<{
    sourceId: string;
    remoteId: string;
    legacySourceId: string | null;
    photoRef: string | null;
    hasInlinePhoto: boolean;
    status: InitialSyncItemStatus;
    confirmedAt?: string;
    error?: string;
  }>;
  legacyMap: Record<string, string>;
  profile: {
    status: InitialSyncItemStatus;
    resolution?: "local" | "remote";
    remoteRevision?: number;
    remoteProfile?: unknown;
    error?: string;
  };
  challengeClaims: Array<{
    challengeId: string;
    claimedAt: string | null;
    status: InitialSyncItemStatus;
    confirmedAt?: string;
    error?: string;
  }>;
  errors: Array<{ stage: string; message: string; at: string }>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type CheckpointStorage = Pick<Storage, "getItem" | "setItem"> & Partial<Pick<Storage, "key" | "length" | "removeItem">>;

export const checkpointKey = (datasetId: string, userId: string, manifestHash: string) => (
  `${INITIAL_SYNC_CHECKPOINT_PREFIX}${datasetId}:${userId}:${manifestHash}`
);

export const loadInitialSyncCheckpoint = (
  datasetId: string,
  userId: string,
  manifestHash: string,
  storage: CheckpointStorage = localStorage,
) => {
  try {
    const raw = storage.getItem(checkpointKey(datasetId, userId, manifestHash));
    if (!raw) return undefined;
    const checkpoint = JSON.parse(raw) as InitialSyncCheckpoint;
    if (checkpoint.schemaVersion !== 1
      || checkpoint.datasetId !== datasetId
      || checkpoint.userId !== userId
      || checkpoint.manifestHash !== manifestHash) return undefined;
    return checkpoint;
  } catch {
    return undefined;
  }
};

export const saveInitialSyncCheckpoint = (
  checkpoint: InitialSyncCheckpoint,
  storage: CheckpointStorage = localStorage,
) => {
  const key = checkpointKey(checkpoint.datasetId, checkpoint.userId, checkpoint.manifestHash);
  const serialized = JSON.stringify(checkpoint);
  try {
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized) throw new Error("checkpoint_verification_failed");
  } catch {
    throw new Error("No se pudo guardar el avance de la vinculación en este dispositivo.");
  }
};

export const findInitialSyncCheckpoints = (
  datasetId: string,
  userId: string,
  storage: CheckpointStorage = localStorage,
) => {
  if (typeof storage.length !== "number" || typeof storage.key !== "function") return [];
  const prefix = `${INITIAL_SYNC_CHECKPOINT_PREFIX}${datasetId}:${userId}:`;
  const checkpoints: InitialSyncCheckpoint[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    try {
      const parsed = JSON.parse(storage.getItem(key) ?? "") as InitialSyncCheckpoint;
      if (parsed.schemaVersion === 1 && parsed.datasetId === datasetId && parsed.userId === userId) checkpoints.push(parsed);
    } catch {
      // Ignore only the damaged checkpoint; the anonymous dataset stays untouched.
    }
  }
  return checkpoints.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

export const removeInitialSyncCheckpointsForUser = (
  userId: string,
  storage: CheckpointStorage = localStorage,
) => {
  if (typeof storage.length !== "number" || typeof storage.key !== "function" || typeof storage.removeItem !== "function") return 0;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(INITIAL_SYNC_CHECKPOINT_PREFIX)) continue;
    try {
      const value = JSON.parse(storage.getItem(key) ?? "") as Partial<InitialSyncCheckpoint>;
      if (value.userId === userId) keys.push(key);
    } catch {
      // A damaged checkpoint is not attributed to an account by key shape alone.
    }
  }
  keys.forEach((key) => storage.removeItem?.(key));
  return keys.length;
};

