import { weeklyChallenges } from "../data/challenges";
import type { WeeklyChallengeDefinition } from "../types";

export interface ChallengeCatalogService {
  listWeeklyChallenges(): Promise<WeeklyChallengeDefinition[]>;
}

export const localChallengeCatalogService: ChallengeCatalogService = {
  async listWeeklyChallenges() {
    return weeklyChallenges.map((challenge) => ({
      ...challenge,
      objectives: challenge.objectives.map((objective) => ({ ...objective })),
    }));
  },
};
