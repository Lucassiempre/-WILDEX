import { categories } from "../data/species";
import { getSupabaseClient } from "../lib/supabaseClient";
import type { Category, Discovery, ExplorerProfile, ExplorerState } from "../types";
import {
  loadExplorerProfileV3,
  loadExplorerStateV3,
  namespaceForAccount,
  saveExplorerProfileV3,
  saveExplorerStateV3,
} from "./localStorageV3Service";
import {
  type CheckpointStorage,
  type InitialSyncCheckpoint,
  loadInitialSyncCheckpoint,
  saveInitialSyncCheckpoint,
} from "./initialSyncCheckpointService";
import {
  buildInitialSyncManifest,
  canonicalJson,
  deterministicLegacyObservationId,
  hashInitialSyncManifest,
  isUuid,
  type InitialSyncManifest,
  type InitialSyncManifestObservation,
} from "./initialSyncManifest";

type RpcResponse = { data: unknown; error: { message?: string; code?: string; details?: string } | null };
export type InitialSyncRpc = (name: string, parameters?: Record<string, unknown>) => Promise<RpcResponse>;

export type InitialSyncProgress = {
  stage: "preparing" | "observations" | "challenges" | "profile" | "verifying" | "complete" | "failed" | "profile-conflict";
  current?: number;
  total?: number;
  message: string;
};

export type InitialSyncResult = {
  kind: "complete" | "failed" | "profile-conflict" | "observation-conflict";
  checkpoint: InitialSyncCheckpoint;
  state?: ExplorerState;
  profile?: ExplorerProfile;
  message: string;
};

export type ProfileResolution = "local" | "remote";

type InitialSyncOptions = {
  userId: string;
  datasetId: string;
  anonymousState: ExplorerState;
  anonymousProfile: ExplorerProfile;
  profileResolution?: ProfileResolution;
  storage?: CheckpointStorage;
  rpc?: InitialSyncRpc;
  now?: () => Date;
  onProgress?: (progress: InitialSyncProgress) => void;
  persistAccountSnapshot?: (userId: string, state: ExplorerState, profile: ExplorerProfile) => void;
};

type RemoteObservation = {
  id?: string;
  species_id?: string;
  variant_id?: string | null;
  observed_at?: string;
  identification_method?: string;
  sync_revision?: number;
};

type RemoteProfile = {
  username?: string | null;
  display_name?: string | null;
  bio?: string | null;
  avatar_config?: Record<string, unknown>;
  favorite_species_id?: string | null;
  client_updated_at?: string | null;
  sync_revision?: number;
  created_at?: string;
  updated_at?: string;
};

type LocalPhotoReference = Pick<Discovery, "id" | "photoRef" | "photo">;

const activeImports = new Map<string, Promise<InitialSyncResult>>();

const asRecord = (value: unknown): Record<string, unknown> | undefined => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined
);

const asRows = (value: unknown) => Array.isArray(value) ? value : value == null ? [] : [value];
const firstRecord = (value: unknown) => asRecord(Array.isArray(value) ? value[0] : value);
const textOrNull = (value: unknown) => typeof value === "string" && value.length ? value : null;
const numberOr = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;

const snapshotRemotePhoto = (observation: Record<string, unknown>): Discovery["remotePhoto"] => {
  const mimeType = textOrNull(observation.photo_mime_type);
  const path = textOrNull(observation.photo_path);
  const sha256 = textOrNull(observation.photo_sha256);
  const sizeBytes = numberOr(observation.photo_size_bytes, -1);
  if (!path || !sha256 || sizeBytes <= 0 || !["image/jpeg", "image/png", "image/webp"].includes(mimeType ?? "")) return undefined;
  return { path, sha256, sizeBytes, mimeType: mimeType as NonNullable<Discovery["remotePhoto"]>["mimeType"] };
};

class InitialSyncRpcError extends Error {
  code?: string;

  constructor(error: NonNullable<RpcResponse["error"]>) {
    super(error.message || error.details || "La operación remota no pudo completarse.");
    this.code = error.code;
  }
}

const defaultRpc: InitialSyncRpc = async (name, parameters) => {
  const { data, error } = await getSupabaseClient().rpc(name, parameters);
  return { data, error };
};

const callRpc = async (rpc: InitialSyncRpc, name: string, parameters?: Record<string, unknown>) => {
  const result = await rpc(name, parameters);
  if (result.error) throw new InitialSyncRpcError(result.error);
  return result.data;
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const errorHas = (error: unknown, value: string) => errorMessage(error).includes(value);

const createCheckpoint = async ({
  manifest,
  manifestHash,
  userId,
  now,
}: {
  manifest: InitialSyncManifest;
  manifestHash: string;
  userId: string;
  now: Date;
}): Promise<InitialSyncCheckpoint> => {
  const observations = [] as InitialSyncCheckpoint["observations"];
  const legacyMap: Record<string, string> = {};
  for (const observation of manifest.observations) {
    const legacySourceId = isUuid(observation.sourceId) ? null : observation.sourceId;
    const remoteId = legacySourceId
      ? await deterministicLegacyObservationId({ userId, datasetId: manifest.datasetId, legacyId: legacySourceId })
      : observation.sourceId;
    if (legacySourceId) legacyMap[legacySourceId] = remoteId;
    observations.push({
      sourceId: observation.sourceId,
      remoteId,
      legacySourceId,
      photoRef: observation.photo.ref,
      hasInlinePhoto: observation.photo.hasInlineFallback,
      status: "pending",
    });
  }
  const timestamp = now.toISOString();
  return {
    schemaVersion: 1,
    datasetId: manifest.datasetId,
    userId,
    manifestHash,
    manifest,
    status: "prepared",
    observations,
    legacyMap,
    profile: { status: "pending" },
    challengeClaims: manifest.challengeClaims.map((claim) => ({ ...claim, status: "pending" })),
    errors: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

const saveCheckpoint = (
  checkpoint: InitialSyncCheckpoint,
  storage: CheckpointStorage,
  now: () => Date,
) => {
  checkpoint.updatedAt = now().toISOString();
  saveInitialSyncCheckpoint(checkpoint, storage);
};

const observationParameters = (
  manifestObservation: InitialSyncManifestObservation,
  checkpointObservation: InitialSyncCheckpoint["observations"][number],
  importId: string,
  expectedRevision: number | null,
) => ({
  p_observation_id: checkpointObservation.remoteId,
  p_species_id: manifestObservation.speciesId,
  p_observed_at: manifestObservation.observedAt,
  p_identification_method: manifestObservation.identificationMethod,
  p_variant_id: manifestObservation.variantId,
  p_species_confidence: manifestObservation.speciesConfidence,
  p_variant_confidence: null,
  p_notes: manifestObservation.notes,
  p_custom_name: manifestObservation.customName,
  p_client_created_at: manifestObservation.observedAt,
  p_client_updated_at: manifestObservation.observedAt,
  p_import_id: importId,
  p_legacy_source_id: checkpointObservation.legacySourceId,
  p_expected_revision: expectedRevision,
});

const getSnapshot = async (rpc: InitialSyncRpc) => {
  const snapshot = await callRpc(rpc, "get_account_snapshot");
  const record = asRecord(snapshot);
  if (!record) throw new Error("Supabase devolvió un snapshot de cuenta inválido.");
  return record;
};

const sameStableIdentity = (remote: RemoteObservation, local: InitialSyncManifestObservation) => (
  remote.species_id === local.speciesId
  && (remote.variant_id ?? null) === local.variantId
  && remote.observed_at === local.observedAt
  && remote.identification_method === local.identificationMethod
);

const remoteProfileIsBlank = (profile: RemoteProfile | undefined, featuredBadgeIds: string[]) => (
  !profile
  || (
    profile.username == null
    && profile.display_name == null
    && profile.bio == null
    && canonicalJson(profile.avatar_config ?? {}) === "{}"
    && profile.favorite_species_id == null
    && featuredBadgeIds.length === 0
  )
);

const remoteProfileMatches = (
  profile: RemoteProfile | undefined,
  featuredBadgeIds: string[],
  manifest: InitialSyncManifest,
) => Boolean(profile)
  && (profile!.username ?? "") === manifest.profile.username
  && (profile!.display_name ?? "") === manifest.profile.displayName
  && (profile!.bio ?? null) === manifest.profile.bio
  && canonicalJson(profile!.avatar_config ?? {}) === canonicalJson(manifest.profile.avatarConfig)
  && (profile!.favorite_species_id ?? null) === manifest.profile.favoriteSpeciesId
  && canonicalJson(featuredBadgeIds) === canonicalJson(manifest.profile.featuredBadgeIds);

const isPersistentLocalPhotoRef = (value: string | undefined): value is string => (
  value?.startsWith("filesystem:") === true || value?.startsWith("indexeddb:") === true
);

export const preserveLocalObservationPhotos = (
  remoteState: ExplorerState,
  localDiscoveries: LocalPhotoReference[],
): ExplorerState => {
  const localPhotos = new Map(localDiscoveries
    .filter((discovery) => isPersistentLocalPhotoRef(discovery.photoRef))
    .map((discovery) => [discovery.id, discovery]));

  return {
    ...remoteState,
    discoveries: remoteState.discoveries.map((discovery) => {
      const local = localPhotos.get(discovery.id);
      return local ? { ...discovery, photoRef: local.photoRef, photo: local.photo } : discovery;
    }),
  };
};

const checkpointPhotoReferences = (checkpoint: InitialSyncCheckpoint): LocalPhotoReference[] => checkpoint.observations
  .filter((observation) => isPersistentLocalPhotoRef(observation.photoRef ?? undefined))
  .map((observation) => ({ id: observation.remoteId, photoRef: observation.photoRef! }));

const snapshotToLocal = (
  snapshot: Record<string, unknown>,
  userId: string,
  localDiscoveries: LocalPhotoReference[] = [],
): { state: ExplorerState; profile: ExplorerProfile } => {
  const observations = asRows(snapshot.observations).map(asRecord).filter(Boolean) as Record<string, unknown>[];
  const events = asRows(snapshot.xpEvents).map(asRecord).filter(Boolean) as Record<string, unknown>[];
  const claims = asRows(snapshot.challengeClaims).map(asRecord).filter(Boolean) as Record<string, unknown>[];
  const badges = asRows(snapshot.badges).map(asRecord).filter(Boolean) as Record<string, unknown>[];
  const profileRow = asRecord(snapshot.profile) as RemoteProfile | undefined;
  const featuredBadgeIds = asRows(snapshot.featuredBadgeIds).filter((value): value is string => typeof value === "string");

  const discoveries: Discovery[] = observations.map((observation) => ({
    id: String(observation.id),
    speciesId: String(observation.species_id),
    discoveredAt: String(observation.observed_at),
    variantId: textOrNull(observation.variant_id) ?? undefined,
    identificationMethod: (textOrNull(observation.identification_method) ?? "legacy") as Discovery["identificationMethod"],
    confidence: typeof observation.species_confidence === "number" ? observation.species_confidence : undefined,
    notes: textOrNull(observation.notes) ?? undefined,
    customName: textOrNull(observation.custom_name) ?? undefined,
    remotePhoto: snapshotRemotePhoto(observation),
  }));
  const awardedCategoryBonuses = [...new Set(events
    .filter((event) => event.event_type === "category-bonus")
    .map((event) => asRecord(event.metadata)?.category)
    .filter((value): value is Category => typeof value === "string" && categories.includes(value as Category)))];
  const state = preserveLocalObservationPhotos({
    discoveries,
    xp: numberOr(snapshot.xpTotal),
    awardedCategoryBonuses,
    claimedChallengeIds: claims.map((claim) => String(claim.challenge_id)),
    earnedBadgeIds: badges.map((badge) => String(badge.badge_id)),
    badgeAwards: badges.map((badge) => ({
      badgeId: String(badge.badge_id),
      challengeId: String(badge.challenge_id ?? ""),
      earnedAt: textOrNull(badge.earned_at) ?? undefined,
    })).filter((badge) => badge.challengeId.length > 0),
  }, localDiscoveries);
  const now = new Date().toISOString();
  const profile: ExplorerProfile = {
    userId,
    username: profileRow?.username ?? "explorador",
    displayName: profileRow?.display_name ?? "Explorador",
    bio: profileRow?.bio ?? undefined,
    avatarConfig: profileRow?.avatar_config as ExplorerProfile["avatarConfig"],
    favoriteSpeciesId: profileRow?.favorite_species_id ?? undefined,
    featuredBadgeIds,
    createdAt: profileRow?.created_at ?? now,
    updatedAt: profileRow?.updated_at ?? now,
  };
  return { state, profile };
};

const defaultPersistAccountSnapshot = (userId: string, state: ExplorerState, profile: ExplorerProfile) => {
  const namespace = namespaceForAccount(userId);
  const reconciledState = preserveLocalObservationPhotos(state, loadExplorerStateV3(namespace).discoveries);
  if (!saveExplorerStateV3(namespace, reconciledState) || !saveExplorerProfileV3(namespace, profile)) {
    throw new Error("El servidor confirmó el progreso, pero no pudo guardarse el snapshot local de la cuenta.");
  }
};

const runImport = async (
  options: InitialSyncOptions,
  manifest: InitialSyncManifest,
  manifestHash: string,
): Promise<InitialSyncResult> => {
  const storage = options.storage ?? localStorage;
  const rpc = options.rpc ?? defaultRpc;
  const now = options.now ?? (() => new Date());
  const progress = options.onProgress ?? (() => undefined);
  let checkpoint = loadInitialSyncCheckpoint(options.datasetId, options.userId, manifestHash, storage)
    ?? await createCheckpoint({ manifest, manifestHash, userId: options.userId, now: now() });
  const persist = () => saveCheckpoint(checkpoint, storage, now);
  const localPhotoReferences = () => [
    ...checkpointPhotoReferences(checkpoint),
    ...loadExplorerStateV3(namespaceForAccount(options.userId), storage).discoveries,
  ];
  const fail = (stage: string, error: unknown, kind: InitialSyncResult["kind"] = "failed"): InitialSyncResult => {
    const message = errorMessage(error);
    checkpoint.status = kind === "profile-conflict" ? "profile-conflict" : "failed";
    checkpoint.errors.push({ stage, message, at: now().toISOString() });
    try { persist(); } catch { /* The prior durable checkpoint remains available. */ }
    progress({ stage: kind === "profile-conflict" ? "profile-conflict" : "failed", message });
    return { kind, checkpoint, message };
  };

  try {
    if (checkpoint.status === "complete") {
      const snapshot = await getSnapshot(rpc);
      const local = snapshotToLocal(snapshot, options.userId, localPhotoReferences());
      (options.persistAccountSnapshot ?? defaultPersistAccountSnapshot)(options.userId, local.state, local.profile);
      return { kind: "complete", checkpoint, ...local, message: "Progreso vinculado correctamente." };
    }

    checkpoint.status = "running";
    persist();
    progress({ stage: "preparing", message: "Preparando progreso…" });
    const importData = firstRecord(await callRpc(rpc, "begin_sync_import", {
      p_dataset_id: options.datasetId,
      p_manifest_sha256: manifestHash,
      p_schema_version: manifest.schemaVersion,
      p_expected_observation_count: manifest.observations.length,
      p_expected_photo_count: 0,
      p_expected_challenge_claim_count: manifest.challengeClaims.length,
      p_expects_profile: true,
      p_local_xp_snapshot: manifest.localXpSnapshot,
    }));
    const importId = textOrNull(importData?.id);
    if (!importId) throw new Error("Supabase no devolvió el identificador del import.");
    if (checkpoint.importId && checkpoint.importId !== importId) throw new Error("El batch remoto no coincide con el checkpoint local.");
    checkpoint.importId = importId;
    persist();

    for (let index = 0; index < checkpoint.observations.length; index += 1) {
      const item = checkpoint.observations[index];
      if (item.status === "confirmed") continue;
      const manifestObservation = manifest.observations.find((entry) => entry.sourceId === item.sourceId);
      if (!manifestObservation) return fail("observation", new Error("El checkpoint contiene una observación ajena al manifest."), "observation-conflict");
      progress({ stage: "observations", current: index + 1, total: checkpoint.observations.length, message: `Vinculando observaciones ${index + 1}/${checkpoint.observations.length}…` });
      try {
        await callRpc(rpc, "sync_observation", observationParameters(manifestObservation, item, importId, null));
      } catch (error) {
        if (!errorHas(error, "observation_revision_conflict")) {
          if (errorHas(error, "identity_conflict")) {
            item.status = "conflict";
            item.error = "Esta observación coincide en UUID pero no en especie, variante, fecha o método.";
            persist();
            return fail("observation", new Error(item.error), "observation-conflict");
          }
          throw error;
        }
        const snapshot = await getSnapshot(rpc);
        const remote = (asRows(snapshot.observations).map(asRecord).find((entry) => entry?.id === item.remoteId) ?? {}) as RemoteObservation;
        if (!sameStableIdentity(remote, manifestObservation) || typeof remote.sync_revision !== "number") {
          item.status = "conflict";
          item.error = "La observación remota tiene una identidad incompatible.";
          persist();
          return fail("observation", new Error(item.error), "observation-conflict");
        }
        await callRpc(rpc, "sync_observation", observationParameters(manifestObservation, item, importId, remote.sync_revision));
      }
      item.status = "confirmed";
      item.confirmedAt = now().toISOString();
      item.error = undefined;
      persist();
    }

    progress({ stage: "challenges", message: "Verificando desafíos…" });
    for (const claim of checkpoint.challengeClaims) {
      if (claim.status === "confirmed") continue;
      await callRpc(rpc, "claim_challenge", {
        p_challenge_id: claim.challengeId,
        p_import_id: importId,
        p_client_claimed_at: claim.claimedAt,
      });
      claim.status = "confirmed";
      claim.confirmedAt = now().toISOString();
      claim.error = undefined;
      persist();
    }

    if (checkpoint.profile.status !== "confirmed") {
      progress({ stage: "profile", message: "Sincronizando perfil…" });
      const snapshot = await getSnapshot(rpc);
      const remoteProfile = asRecord(snapshot.profile) as RemoteProfile | undefined;
      const featured = asRows(snapshot.featuredBadgeIds).filter((value): value is string => typeof value === "string");
      const blank = remoteProfileIsBlank(remoteProfile, featured);
      const matches = remoteProfileMatches(remoteProfile, featured, manifest);
      const resolution = options.profileResolution ?? checkpoint.profile.resolution;
      if (!blank && !matches && !resolution) {
        checkpoint.profile = {
          status: "conflict",
          remoteRevision: remoteProfile?.sync_revision,
          remoteProfile: { profile: remoteProfile, featuredBadgeIds: featured },
        };
        checkpoint.status = "profile-conflict";
        persist();
        progress({ stage: "profile-conflict", message: "Elegí qué perfil querés conservar." });
        return { kind: "profile-conflict", checkpoint, message: "La cuenta ya tiene un perfil diferente. Elegí cuál conservar." };
      }

      const useRemote = resolution === "remote" && remoteProfile;
      const profilePayload = useRemote ? {
        username: remoteProfile.username ?? null,
        displayName: remoteProfile.display_name ?? null,
        bio: remoteProfile.bio ?? null,
        avatarConfig: remoteProfile.avatar_config ?? {},
        favoriteSpeciesId: remoteProfile.favorite_species_id ?? null,
        featuredBadgeIds: featured,
        clientUpdatedAt: remoteProfile.client_updated_at ?? null,
      } : {
        username: manifest.profile.username,
        displayName: manifest.profile.displayName,
        bio: manifest.profile.bio,
        avatarConfig: manifest.profile.avatarConfig,
        favoriteSpeciesId: manifest.profile.favoriteSpeciesId,
        featuredBadgeIds: manifest.profile.featuredBadgeIds,
        clientUpdatedAt: manifest.profile.updatedAt,
      };
      await callRpc(rpc, "sync_profile", {
        p_username: profilePayload.username,
        p_display_name: profilePayload.displayName,
        p_bio: profilePayload.bio,
        p_avatar_config: profilePayload.avatarConfig,
        p_favorite_species_id: profilePayload.favoriteSpeciesId,
        p_featured_badge_ids: profilePayload.featuredBadgeIds,
        p_client_updated_at: profilePayload.clientUpdatedAt,
        p_import_id: importId,
        p_expected_revision: remoteProfile?.sync_revision ?? null,
      });
      checkpoint.profile = {
        status: "confirmed",
        resolution: useRemote ? "remote" : "local",
        remoteRevision: remoteProfile?.sync_revision,
      };
      persist();
    }

    progress({ stage: "verifying", message: "Verificando progreso…" });
    checkpoint.status = "verifying";
    persist();
    await callRpc(rpc, "complete_sync_import", { p_import_id: importId });
    const finalSnapshot = await getSnapshot(rpc);
    const local = snapshotToLocal(finalSnapshot, options.userId, localPhotoReferences());
    (options.persistAccountSnapshot ?? defaultPersistAccountSnapshot)(options.userId, local.state, local.profile);
    checkpoint.status = "complete";
    checkpoint.completedAt = now().toISOString();
    persist();
    progress({ stage: "complete", message: "Progreso vinculado correctamente" });
    return { kind: "complete", checkpoint, ...local, message: "Progreso vinculado correctamente." };
  } catch (error) {
    return fail("remote", error);
  }
};

export const linkAnonymousProgress = async (options: InitialSyncOptions): Promise<InitialSyncResult> => {
  const manifest = buildInitialSyncManifest({
    datasetId: options.datasetId,
    state: options.anonymousState,
    profile: options.anonymousProfile,
  });
  const manifestHash = await hashInitialSyncManifest(manifest);
  const lockKey = `${options.datasetId}:${options.userId}:${manifestHash}`;
  const running = activeImports.get(lockKey);
  if (running) return running;
  const promise = runImport(options, manifest, manifestHash).finally(() => activeImports.delete(lockKey));
  activeImports.set(lockKey, promise);
  return promise;
};

export const inspectAnonymousProgressImport = async ({
  datasetId,
  userId,
  state,
  profile,
  storage = localStorage,
}: {
  datasetId: string;
  userId: string;
  state: ExplorerState;
  profile: ExplorerProfile;
  storage?: CheckpointStorage;
}) => {
  const manifest = buildInitialSyncManifest({ datasetId, state, profile });
  const manifestHash = await hashInitialSyncManifest(manifest);
  return {
    manifestHash,
    checkpoint: loadInitialSyncCheckpoint(datasetId, userId, manifestHash, storage),
  };
};

export const loadAnonymousImportSource = (datasetId: string, storage: Storage = localStorage) => {
  const namespace = `anonymous:${datasetId}` as const;
  return {
    state: loadExplorerStateV3(namespace, storage),
    profile: loadExplorerProfileV3(namespace, storage),
  };
};

