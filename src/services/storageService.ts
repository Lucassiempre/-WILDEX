import type { Discovery, ExplorerState } from "../types";

const STORAGE_KEY = "wildex-explorer-state-v2";
const LEGACY_KEY = "wildex-explorer-state-v1";

export const initialExplorerState: ExplorerState = {
  discoveries: [],
  xp: 0,
  awardedCategoryBonuses: [],
};

export const loadExplorerState = (): ExplorerState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return initialExplorerState;
    const parsed = JSON.parse(raw) as ExplorerState;
    const discoveries: Discovery[] = Array.isArray(parsed.discoveries)
      ? parsed.discoveries.filter((item) => item && typeof item.speciesId === "string").map((item, index) => ({
        ...item,
        id: typeof item.id === "string" ? item.id : `legacy-${index}-${item.speciesId}`,
        identificationMethod: item.identificationMethod ?? "legacy",
      }))
      : [];
    return {
      discoveries,
      xp: Number.isFinite(parsed.xp) ? parsed.xp : 0,
      awardedCategoryBonuses: Array.isArray(parsed.awardedCategoryBonuses)
        ? parsed.awardedCategoryBonuses
        : [],
    };
  } catch {
    return initialExplorerState;
  }
};

export const saveExplorerState = (state: ExplorerState): boolean => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
};
