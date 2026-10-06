import type { Discovery, ExplorerProfile, ExplorerState } from "../types";

export const INITIAL_SYNC_MANIFEST_VERSION = 1;
export const WILDEX_LEGACY_NAMESPACE = "22e9ca8f-2188-5ae6-ac74-ec99be38b7e7";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type InitialSyncManifestObservation = {
  sourceId: string;
  speciesId: string;
  variantId: string | null;
  observedAt: string;
  identificationMethod: Discovery["identificationMethod"];
  speciesConfidence: number | null;
  notes: string | null;
  customName: string | null;
  photo: {
    ref: string | null;
    hasInlineFallback: boolean;
  };
};

export type InitialSyncManifestProfile = {
  username: string;
  displayName: string;
  bio: string | null;
  avatarConfig: ExplorerProfile["avatarConfig"];
  favoriteSpeciesId: string | null;
  featuredBadgeIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type InitialSyncManifestClaim = {
  challengeId: string;
  claimedAt: string | null;
};

export type InitialSyncManifest = {
  schemaVersion: typeof INITIAL_SYNC_MANIFEST_VERSION;
  datasetId: string;
  observations: InitialSyncManifestObservation[];
  profile: InitialSyncManifestProfile;
  challengeClaims: InitialSyncManifestClaim[];
  localXpSnapshot: number;
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stableValue(item)]));
};

export const canonicalJson = (value: unknown) => JSON.stringify(stableValue(value));

const bytesToHex = (bytes: Uint8Array) => [...bytes]
  .map((value) => value.toString(16).padStart(2, "0"))
  .join("");

const uuidBytes = (uuid: string) => {
  if (!UUID_PATTERN.test(uuid)) throw new Error("UUID inválido para el namespace de sincronización.");
  return Uint8Array.from(uuid.replaceAll("-", "").match(/.{2}/g)!.map((value) => Number.parseInt(value, 16)));
};

const bytesToUuid = (bytes: Uint8Array) => {
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

export const isUuid = (value: string) => UUID_PATTERN.test(value);

export const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
};

export const deterministicLegacyObservationId = async ({
  userId,
  datasetId,
  legacyId,
}: {
  userId: string;
  datasetId: string;
  legacyId: string;
}) => {
  if (!isUuid(userId) || !isUuid(datasetId) || !legacyId) throw new Error("No se puede generar el UUID legacy.");
  const name = new TextEncoder().encode(`${userId}\u0000${datasetId}\u0000${legacyId}`);
  const payload = new Uint8Array(16 + name.length);
  payload.set(uuidBytes(WILDEX_LEGACY_NAMESPACE));
  payload.set(name, 16);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", payload)).slice(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  return bytesToUuid(digest);
};

const observationSort = (left: InitialSyncManifestObservation, right: InitialSyncManifestObservation) => (
  left.observedAt.localeCompare(right.observedAt)
  || left.sourceId.localeCompare(right.sourceId)
  || left.speciesId.localeCompare(right.speciesId)
);

export const buildInitialSyncManifest = ({
  datasetId,
  state,
  profile,
}: {
  datasetId: string;
  state: ExplorerState;
  profile: ExplorerProfile;
}): InitialSyncManifest => {
  if (!isUuid(datasetId)) throw new Error("El dataset anónimo no tiene un UUID válido.");
  const awardByChallenge = new Map(state.badgeAwards.map((award) => [award.challengeId, award.earnedAt ?? null]));
  return {
    schemaVersion: INITIAL_SYNC_MANIFEST_VERSION,
    datasetId,
    observations: state.discoveries.map((discovery) => ({
      sourceId: discovery.id,
      speciesId: discovery.speciesId,
      variantId: discovery.variantId ?? null,
      observedAt: discovery.discoveredAt,
      identificationMethod: discovery.identificationMethod,
      speciesConfidence: discovery.confidence ?? null,
      notes: discovery.notes?.trim() || null,
      customName: discovery.customName?.trim() || null,
      photo: {
        ref: discovery.photoRef ?? null,
        hasInlineFallback: Boolean(discovery.photo),
      },
    })).sort(observationSort),
    profile: {
      username: profile.username,
      displayName: profile.displayName,
      bio: profile.bio ?? null,
      avatarConfig: { ...profile.avatarConfig },
      favoriteSpeciesId: profile.favoriteSpeciesId ?? null,
      featuredBadgeIds: [...profile.featuredBadgeIds],
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    },
    challengeClaims: [...new Set(state.claimedChallengeIds)].sort().map((challengeId) => ({
      challengeId,
      claimedAt: awardByChallenge.get(challengeId) ?? null,
    })),
    localXpSnapshot: state.xp,
  };
};

export const hashInitialSyncManifest = (manifest: InitialSyncManifest) => sha256Hex(canonicalJson(manifest));

