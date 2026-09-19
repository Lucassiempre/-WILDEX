import type { ExplorerState } from "../types";

const STORAGE_KEY = "wildex-explorer-state-v1";

export const initialExplorerState: ExplorerState = {
  discoveries: [],
  xp: 0,
  awardedCategoryBonuses: [],
};

export const loadExplorerState = (): ExplorerState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialExplorerState;
    const parsed = JSON.parse(raw) as ExplorerState;
    return {
      discoveries: Array.isArray(parsed.discoveries) ? parsed.discoveries : [],
      xp: Number.isFinite(parsed.xp) ? parsed.xp : 0,
      awardedCategoryBonuses: Array.isArray(parsed.awardedCategoryBonuses)
        ? parsed.awardedCategoryBonuses
        : [],
    };
  } catch {
    return initialExplorerState;
  }
};

export const saveExplorerState = (state: ExplorerState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};
