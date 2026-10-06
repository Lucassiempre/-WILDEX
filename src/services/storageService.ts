import type { Discovery, ExplorerState } from "../types";
import { categories } from "../data/species";

export const EXPLORER_STATE_V2_KEY = "wildex-explorer-state-v2";
export const EXPLORER_STATE_V1_KEY = "wildex-explorer-state-v1";

export const initialExplorerState: ExplorerState = {
  discoveries: [],
  xp: 0,
  awardedCategoryBonuses: [],
  claimedChallengeIds: [],
  earnedBadgeIds: [],
  badgeAwards: [],
};

export const parseExplorerState = (raw: string): ExplorerState | undefined => {
  try {
    const parsed = JSON.parse(raw) as ExplorerState;
    if (!parsed || typeof parsed !== "object") return undefined;
    const usedIds = new Set<string>();
    const discoveries: Discovery[] = Array.isArray(parsed.discoveries)
      ? parsed.discoveries.filter((item) => item && typeof item.speciesId === "string").map((item, index) => ({
        ...item,
        id: uniqueId(typeof item.id === "string" ? item.id : `legacy-${index}-${item.speciesId}`, usedIds),
        discoveredAt: validDate(item.discoveredAt) ? item.discoveredAt : new Date(0).toISOString(),
        identificationMethod: item.identificationMethod ?? "legacy",
      }))
      : [];
    return {
      discoveries,
      xp: Number.isFinite(parsed.xp) ? parsed.xp : 0,
      awardedCategoryBonuses: Array.isArray(parsed.awardedCategoryBonuses)
        ? parsed.awardedCategoryBonuses.filter((item) => categories.includes(item))
        : [],
      claimedChallengeIds: uniqueStrings(parsed.claimedChallengeIds),
      earnedBadgeIds: uniqueStrings(parsed.earnedBadgeIds),
      badgeAwards: Array.isArray(parsed.badgeAwards)
        ? parsed.badgeAwards.filter((item) => item && typeof item.badgeId === "string" && typeof item.challengeId === "string").map((item) => ({
          badgeId: item.badgeId,
          challengeId: item.challengeId,
          earnedAt: validDate(item.earnedAt) ? item.earnedAt : undefined,
        }))
        : [],
    };
  } catch {
    return undefined;
  }
};

export const loadExplorerState = (): ExplorerState => {
  try {
    for (const key of [EXPLORER_STATE_V2_KEY, EXPLORER_STATE_V1_KEY]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const state = parseExplorerState(raw);
      if (state) return state;
    }
  } catch {
    // Storage may be unavailable in privacy modes; start with an empty local state.
  }
  return initialExplorerState;
};

const validDate = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

const uniqueStrings = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))]
  : [];

const uniqueId = (candidate: string, usedIds: Set<string>) => {
  let id = candidate;
  let suffix = 1;
  while (usedIds.has(id)) id = `${candidate}-${suffix++}`;
  usedIds.add(id);
  return id;
};

export const saveExplorerState = (state: ExplorerState): boolean => {
  try {
    localStorage.setItem(EXPLORER_STATE_V2_KEY, serializeExplorerState(state));
    return true;
  } catch {
    return false;
  }
};

export const serializeExplorerState = (state: ExplorerState): string => JSON.stringify({
  ...state,
  discoveries: state.discoveries.map((discovery) => {
    if (!discovery.photoRef) return discovery;
    const { photo: _resolvedPhoto, ...storedDiscovery } = discovery;
    return storedDiscovery;
  }),
});
