import { fixedChallenges } from "../data/challenges";
import { getSpeciesById } from "../data/species";
import { thematicCollections } from "../data/thematicCollections";
import type { ChallengeEvaluation, ChallengeObjective, Discovery, ExplorerState, FixedChallengeDefinition, WeeklyChallengeDefinition } from "../types";

const validTime = (value: string) => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
};

const uniqueSpecies = (discoveries: Discovery[]) => new Set(discoveries.map((item) => item.speciesId).filter((id) => Boolean(getSpeciesById(id))));

const objectiveCurrent = (
  objective: ChallengeObjective,
  scopedDiscoveries: Discovery[],
  allDiscoveries: Discovery[],
  range?: { start: number; end: number },
) => {
  if (objective.type === "observation-count") return scopedDiscoveries.length;
  if (objective.type === "unique-species") return uniqueSpecies(scopedDiscoveries).size;
  if (objective.type === "unique-variants") {
    return new Set(scopedDiscoveries
      .filter((item) => item.variantId && (!objective.speciesId || item.speciesId === objective.speciesId))
      .map((item) => `${item.speciesId}:${item.variantId}`)).size;
  }
  if (objective.type === "category-species") {
    return [...uniqueSpecies(scopedDiscoveries)].filter((id) => getSpeciesById(id)?.category === objective.category).length;
  }
  if (objective.type === "collection-species") {
    const collection = thematicCollections.find((item) => item.id === objective.collectionId);
    const memberIds = new Set(collection?.speciesIds ?? []);
    return [...uniqueSpecies(scopedDiscoveries)].filter((id) => memberIds.has(id)).length;
  }
  if (!range) return 0;

  const firstDiscoveryBySpecies = new Map<string, number>();
  allDiscoveries.forEach((item) => {
    const time = validTime(item.discoveredAt);
    if (time === undefined || !getSpeciesById(item.speciesId)) return;
    const previous = firstDiscoveryBySpecies.get(item.speciesId);
    if (previous === undefined || time < previous) firstDiscoveryBySpecies.set(item.speciesId, time);
  });
  return [...firstDiscoveryBySpecies.values()].filter((time) => time >= range.start && time <= range.end).length;
};

const evaluateObjectives = (objectives: ChallengeObjective[], scoped: Discovery[], all: Discovery[], range?: { start: number; end: number }) =>
  objectives.map((objective) => {
    const current = Math.min(objective.target, objectiveCurrent(objective, scoped, all, range));
    return { ...objective, current, completed: current >= objective.target };
  });

export const evaluateFixedChallenges = (
  state: ExplorerState,
  definitions: FixedChallengeDefinition[] = fixedChallenges,
): ChallengeEvaluation[] => definitions.map((challenge) => {
  const objectives = evaluateObjectives([challenge.objective], state.discoveries, state.discoveries);
  return {
    id: challenge.id,
    title: challenge.title,
    description: challenge.description,
    kind: "fixed",
    phase: "permanent",
    objectives,
    completed: objectives.every((item) => item.completed),
    claimed: (state.claimedChallengeIds ?? []).includes(challenge.id),
    xpReward: challenge.xpReward,
    badgeId: challenge.badgeId,
  };
});

export const evaluateWeeklyChallenges = (
  state: ExplorerState,
  definitions: WeeklyChallengeDefinition[],
  now = new Date(),
): ChallengeEvaluation[] => definitions.filter((challenge) => challenge.status !== "draft").map((challenge) => {
  const start = validTime(challenge.startDate) ?? 0;
  const end = validTime(challenge.endDate) ?? 0;
  const nowTime = now.getTime();
  const phase = nowTime < start ? "upcoming" : nowTime > end ? "ended" : "active";
  const scoped = state.discoveries.filter((item) => {
    const time = validTime(item.discoveredAt);
    return time !== undefined && time >= start && time <= end;
  });
  const objectives = evaluateObjectives(challenge.objectives, scoped, state.discoveries, { start, end });
  const completed = challenge.status === "published" && phase !== "upcoming" && objectives.every((item) => item.completed);
  return {
    id: challenge.id,
    title: challenge.title,
    description: challenge.description,
    kind: "weekly",
    phase,
    objectives,
    completed,
    claimed: (state.claimedChallengeIds ?? []).includes(challenge.id),
    xpReward: challenge.xpReward,
    badgeId: challenge.badgeId,
    startDate: challenge.startDate,
    endDate: challenge.endDate,
  };
});

export type ClaimChallengeResult = {
  state: ExplorerState;
  xpAwarded: number;
  badgeId?: string;
  claimed: boolean;
};

export const claimChallengeReward = (
  state: ExplorerState,
  challengeId: string,
  weeklyDefinitions: WeeklyChallengeDefinition[] = [],
  now = new Date(),
): ClaimChallengeResult => {
  const challenge = [...evaluateFixedChallenges(state), ...evaluateWeeklyChallenges(state, weeklyDefinitions, now)]
    .find((item) => item.id === challengeId);
  if (!challenge || !challenge.completed || challenge.claimed) return { state, xpAwarded: 0, claimed: false };

  const claimedChallengeIds = [...new Set([...(state.claimedChallengeIds ?? []), challenge.id])];
  const earnedBadgeIds = challenge.badgeId
    ? [...new Set([...(state.earnedBadgeIds ?? []), challenge.badgeId])]
    : [...(state.earnedBadgeIds ?? [])];
  const badgeAwards = challenge.badgeId && !(state.badgeAwards ?? []).some((item) => item.badgeId === challenge.badgeId)
    ? [...(state.badgeAwards ?? []), { badgeId: challenge.badgeId, challengeId: challenge.id, earnedAt: now.toISOString() }]
    : [...(state.badgeAwards ?? [])];
  return {
    state: { ...state, xp: state.xp + challenge.xpReward, claimedChallengeIds, earnedBadgeIds, badgeAwards },
    xpAwarded: challenge.xpReward,
    badgeId: challenge.badgeId,
    claimed: true,
  };
};
