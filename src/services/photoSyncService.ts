import { getSupabaseClient } from "../lib/supabaseClient";
import type { Discovery, RemotePhotoMetadata } from "../types";
import type { CheckpointStorage, InitialSyncCheckpoint } from "./initialSyncCheckpointService";
import {
  cacheRemoteObservationPhoto,
  readObservationPhotoBytes,
  remoteObservationPhotoCacheRef,
  resolveObservationPhoto,
} from "./photoStorageService";

export const PHOTO_BUCKET = "observation-photos";
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_OUTBOX_PREFIX = "wildex-photo-outbox-v1:";

export type AllowedPhotoMime = "image/jpeg" | "image/png" | "image/webp";
export type PhotoOutboxStage = "photo-upload" | "photo-attach" | "complete";

export type PhotoOutboxItem = {
  observationId: string;
  sourceId: string;
  localRef: string;
  stage: PhotoOutboxStage;
  sha256?: string;
  mimeType?: AllowedPhotoMime;
  extension?: "jpg" | "png" | "webp";
  sizeBytes?: number;
  remotePath?: string;
  uploadedAt?: string;
  attachedAt?: string;
  attempts: number;
  lastError?: string;
};

export type PhotoOutbox = {
  schemaVersion: 1;
  userId: string;
  items: PhotoOutboxItem[];
  createdAt: string;
  updatedAt: string;
};

export type PhotoSyncProgress = {
  current: number;
  total: number;
  failed: number;
  message?: string;
};

export type PhotoRemoteAdapter = {
  upload(path: string, bytes: Uint8Array, mimeType: AllowedPhotoMime): Promise<void>;
  download(path: string): Promise<Uint8Array>;
  attach(parameters: Record<string, unknown>): Promise<Record<string, unknown>>;
  snapshot(): Promise<Record<string, unknown>>;
};

type SyncPhotoOptions = {
  userId: string;
  checkpoint: InitialSyncCheckpoint;
  storage?: CheckpointStorage;
  remote?: PhotoRemoteAdapter;
  readLocal?: (reference: string) => Promise<Uint8Array | undefined>;
  now?: () => Date;
  onProgress?: (progress: PhotoSyncProgress) => void;
};

const activePhotoSyncs = new Map<string, Promise<PhotoSyncResult>>();

const outboxKey = (userId: string) => `${PHOTO_OUTBOX_PREFIX}${userId}`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const asRecord = (value: unknown): Record<string, unknown> | undefined => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined
);
const firstRecord = (value: unknown) => asRecord(Array.isArray(value) ? value[0] : value);
const rows = (value: unknown) => Array.isArray(value) ? value.map(asRecord).filter(Boolean) as Record<string, unknown>[] : [];

export const loadPhotoOutbox = (userId: string, storage: CheckpointStorage = localStorage): PhotoOutbox | undefined => {
  try {
    const raw = storage.getItem(outboxKey(userId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as PhotoOutbox;
    if (parsed.schemaVersion !== 1 || parsed.userId !== userId || !Array.isArray(parsed.items)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
};

export const removePhotoOutbox = (userId: string, storage: CheckpointStorage = localStorage) => {
  storage.removeItem?.(outboxKey(userId));
};

const savePhotoOutbox = (outbox: PhotoOutbox, storage: CheckpointStorage) => {
  const serialized = JSON.stringify(outbox);
  storage.setItem(outboxKey(outbox.userId), serialized);
  if (storage.getItem(outboxKey(outbox.userId)) !== serialized) throw new Error("photo_outbox_verification_failed");
};

export const sha256Photo = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
};

export const inspectPhotoBytes = (bytes: Uint8Array): { mimeType: AllowedPhotoMime; extension: "jpg" | "png" | "webp" } => {
  if (bytes.length > PHOTO_MAX_BYTES) throw new Error("photo_too_large");
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return { mimeType: "image/png", extension: "png" };
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") {
    return { mimeType: "image/webp", extension: "webp" };
  }
  throw new Error("unsupported_photo_type");
};

export const deterministicPhotoPath = (
  userId: string,
  observationId: string,
  sha256: string,
  extension: "jpg" | "png" | "webp",
) => `${userId}/${observationId}/${sha256}.${extension}`;

const defaultRemote = (): PhotoRemoteAdapter => ({
  async upload(path, bytes, mimeType) {
    const { error } = await getSupabaseClient().storage.from(PHOTO_BUCKET).upload(path, bytes, {
      contentType: mimeType,
      upsert: false,
      cacheControl: "31536000",
    });
    if (error) throw error;
  },
  async download(path) {
    const { data, error } = await getSupabaseClient().storage.from(PHOTO_BUCKET).download(path);
    if (error) throw error;
    return new Uint8Array(await data.arrayBuffer());
  },
  async attach(parameters) {
    const { data, error } = await getSupabaseClient().rpc("attach_observation_photo", parameters);
    if (error) throw error;
    const record = firstRecord(data);
    if (!record) throw new Error("invalid_attach_response");
    return record;
  },
  async snapshot() {
    const { data, error } = await getSupabaseClient().rpc("get_account_snapshot");
    if (error) throw error;
    const record = asRecord(data);
    if (!record) throw new Error("invalid_account_snapshot");
    return record;
  },
});

const remotePhotoFromRow = (row: Record<string, unknown>): RemotePhotoMetadata | undefined => {
  if (typeof row.photo_path !== "string" || typeof row.photo_mime_type !== "string"
    || typeof row.photo_size_bytes !== "number" || typeof row.photo_sha256 !== "string") return undefined;
  if (!["image/jpeg", "image/png", "image/webp"].includes(row.photo_mime_type)) return undefined;
  return {
    path: row.photo_path,
    mimeType: row.photo_mime_type as AllowedPhotoMime,
    sizeBytes: row.photo_size_bytes,
    sha256: row.photo_sha256,
  };
};

const sameRemotePhoto = (row: Record<string, unknown>, item: PhotoOutboxItem) => {
  const photo = remotePhotoFromRow(row);
  return Boolean(photo && photo.path === item.remotePath && photo.mimeType === item.mimeType
    && photo.sizeBytes === item.sizeBytes && photo.sha256 === item.sha256);
};

const verifyRemoteObject = async (remote: PhotoRemoteAdapter, item: PhotoOutboxItem) => {
  if (!item.remotePath || !item.sha256 || !item.mimeType || !item.sizeBytes) throw new Error("photo_metadata_incomplete");
  const downloaded = await remote.download(item.remotePath);
  const detected = inspectPhotoBytes(downloaded);
  const hash = await sha256Photo(downloaded);
  if (downloaded.byteLength !== item.sizeBytes || detected.mimeType !== item.mimeType || hash !== item.sha256) {
    throw new Error("remote_photo_hash_mismatch");
  }
};

const mergeCheckpointPhotos = (outbox: PhotoOutbox, checkpoint: InitialSyncCheckpoint) => {
  for (const observation of checkpoint.observations) {
    if (observation.status !== "confirmed" || !observation.photoRef) continue;
    if (outbox.items.some((item) => item.observationId === observation.remoteId && item.localRef === observation.photoRef)) continue;
    outbox.items.push({
      observationId: observation.remoteId,
      sourceId: observation.sourceId,
      localRef: observation.photoRef,
      stage: "photo-upload",
      attempts: 0,
    });
  }
};

const prepareItem = async (item: PhotoOutboxItem, userId: string, readLocal: (reference: string) => Promise<Uint8Array | undefined>) => {
  const bytes = await readLocal(item.localRef);
  if (!bytes?.byteLength) throw new Error("local_photo_unavailable");
  const detected = inspectPhotoBytes(bytes);
  const sha256 = await sha256Photo(bytes);
  const path = deterministicPhotoPath(userId, item.observationId, sha256, detected.extension);
  if (item.sha256 && (item.sha256 !== sha256 || item.remotePath !== path)) throw new Error("local_photo_changed");
  Object.assign(item, {
    sha256,
    mimeType: detected.mimeType,
    extension: detected.extension,
    sizeBytes: bytes.byteLength,
    remotePath: path,
  });
  return bytes;
};

export type PhotoSyncResult = {
  outbox: PhotoOutbox;
  total: number;
  completed: number;
  failed: number;
};

const runPhotoSync = async (options: SyncPhotoOptions): Promise<PhotoSyncResult> => {
  const storage = options.storage ?? localStorage;
  const now = options.now ?? (() => new Date());
  const readLocal = options.readLocal ?? readObservationPhotoBytes;
  const remote = options.remote ?? defaultRemote();
  const timestamp = now().toISOString();
  const outbox = loadPhotoOutbox(options.userId, storage) ?? {
    schemaVersion: 1,
    userId: options.userId,
    items: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  mergeCheckpointPhotos(outbox, options.checkpoint);
  outbox.updatedAt = timestamp;
  savePhotoOutbox(outbox, storage);

  const pending = outbox.items.filter((item) => item.stage !== "complete");
  let failed = 0;
  if (!pending.length) {
    return { outbox, total: outbox.items.length, completed: outbox.items.length, failed: 0 };
  }
  let snapshot: Record<string, unknown>;
  try {
    snapshot = await remote.snapshot();
  } catch (error) {
    for (const item of pending) item.lastError = errorMessage(error);
    outbox.updatedAt = now().toISOString();
    savePhotoOutbox(outbox, storage);
    return { outbox, total: outbox.items.length, completed: outbox.items.filter((item) => item.stage === "complete").length, failed: pending.length };
  }
  let observations = rows(snapshot.observations);

  for (let index = 0; index < pending.length; index += 1) {
    const item = pending[index];
    options.onProgress?.({ current: index + 1, total: pending.length, failed, message: `Sincronizando fotos ${index + 1}/${pending.length}…` });
    try {
      const bytes = await prepareItem(item, options.userId, readLocal);
      item.attempts += 1;
      item.lastError = undefined;
      outbox.updatedAt = now().toISOString();
      savePhotoOutbox(outbox, storage);

      let row = observations.find((candidate) => candidate.id === item.observationId);
      if (!row) throw new Error("remote_observation_not_found");
      if (sameRemotePhoto(row, item)) {
        item.stage = "complete";
        item.attachedAt = now().toISOString();
        outbox.updatedAt = now().toISOString();
        savePhotoOutbox(outbox, storage);
        continue;
      }

      if (item.stage === "photo-upload") {
        try {
          await remote.upload(item.remotePath!, bytes, item.mimeType!);
        } catch (uploadError) {
          try {
            await verifyRemoteObject(remote, item);
          } catch {
            throw uploadError;
          }
        }
        await verifyRemoteObject(remote, item);
        item.stage = "photo-attach";
        item.uploadedAt = now().toISOString();
        outbox.updatedAt = now().toISOString();
        savePhotoOutbox(outbox, storage);
      } else {
        await verifyRemoteObject(remote, item);
      }

      snapshot = await remote.snapshot();
      observations = rows(snapshot.observations);
      row = observations.find((candidate) => candidate.id === item.observationId);
      if (!row) throw new Error("remote_observation_not_found");
      if (!sameRemotePhoto(row, item)) {
        if (remotePhotoFromRow(row)) throw new Error("remote_photo_conflict");
        if (typeof row.sync_revision !== "number") throw new Error("remote_revision_missing");
        try {
          await remote.attach({
            p_observation_id: item.observationId,
            p_photo_path: item.remotePath,
            p_photo_mime_type: item.mimeType,
            p_photo_size_bytes: item.sizeBytes,
            p_photo_sha256: item.sha256,
            p_expected_revision: row.sync_revision,
          });
        } catch (attachError) {
          snapshot = await remote.snapshot();
          observations = rows(snapshot.observations);
          const refreshed = observations.find((candidate) => candidate.id === item.observationId);
          if (!refreshed || !sameRemotePhoto(refreshed, item)) throw attachError;
        }
      }
      item.stage = "complete";
      item.attachedAt = now().toISOString();
      item.lastError = undefined;
      outbox.updatedAt = now().toISOString();
      savePhotoOutbox(outbox, storage);
    } catch (error) {
      failed += 1;
      item.lastError = errorMessage(error);
      outbox.updatedAt = now().toISOString();
      try { savePhotoOutbox(outbox, storage); } catch { /* Keep the last durable checkpoint. */ }
    }
  }

  return {
    outbox,
    total: outbox.items.length,
    completed: outbox.items.filter((item) => item.stage === "complete").length,
    failed,
  };
};

export const syncObservationPhotos = (options: SyncPhotoOptions) => {
  const lockKey = options.userId;
  const running = activePhotoSyncs.get(lockKey);
  if (running) return running;
  const promise = runPhotoSync(options).finally(() => activePhotoSyncs.delete(lockKey));
  activePhotoSyncs.set(lockKey, promise);
  return promise;
};

export const resolveDiscoveryPhoto = async (
  discovery: Discovery,
  userId: string,
  adapters: {
    remote?: Pick<PhotoRemoteAdapter, "download">;
    resolveLocal?: typeof resolveObservationPhoto;
    cacheRemote?: typeof cacheRemoteObservationPhoto;
    cacheReference?: typeof remoteObservationPhotoCacheRef;
  } = {},
) => {
  const remote = adapters.remote ?? defaultRemote();
  const resolveLocal = adapters.resolveLocal ?? resolveObservationPhoto;
  const cacheRemote = adapters.cacheRemote ?? cacheRemoteObservationPhoto;
  const cacheReference = adapters.cacheReference ?? remoteObservationPhotoCacheRef;
  if (discovery.photoRef) {
    try {
      const local = await resolveLocal(discovery.photoRef);
      if (local) return { src: local, source: "local" as const, cacheRef: discovery.photoRef };
    } catch {
      // A verified remote copy may recover a missing local file.
    }
  }
  const metadata = discovery.remotePhoto;
  if (!metadata) return undefined;
  const extension = inspectPhotoPath(metadata, userId, discovery.id);
  const expectedCacheRef = cacheReference({ userId, observationId: discovery.id, sha256: metadata.sha256, extension });
  try {
    const cached = await resolveLocal(expectedCacheRef);
    if (cached) return { src: cached, source: "local" as const, cacheRef: expectedCacheRef };
  } catch {
    // Download and rebuild a damaged cache entry.
  }
  const bytes = await remote.download(metadata.path);
  const detected = inspectPhotoBytes(bytes);
  const hash = await sha256Photo(bytes);
  if (detected.extension !== extension || detected.mimeType !== metadata.mimeType
    || bytes.byteLength !== metadata.sizeBytes || hash !== metadata.sha256) throw new Error("remote_photo_hash_mismatch");
  const cacheRef = await cacheRemote({
    userId,
    observationId: discovery.id,
    sha256: metadata.sha256,
    extension,
    mimeType: metadata.mimeType,
    bytes,
  });
  const src = await resolveLocal(cacheRef);
  if (!src) throw new Error("remote_photo_cache_failed");
  return { src, source: "remote" as const, cacheRef };
};

const inspectPhotoPath = (metadata: RemotePhotoMetadata, userId: string, observationId: string) => {
  const extension = metadata.mimeType === "image/jpeg" ? "jpg" : metadata.mimeType === "image/png" ? "png" : "webp";
  const expected = deterministicPhotoPath(userId, observationId, metadata.sha256, extension);
  if (metadata.path !== expected || metadata.sizeBytes <= 0 || metadata.sizeBytes > PHOTO_MAX_BYTES
    || !/^[0-9a-f]{64}$/.test(metadata.sha256)) throw new Error("invalid_remote_photo_metadata");
  return extension;
};
