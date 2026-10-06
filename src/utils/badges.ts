import type { BadgeCatalogItem, FixedChallengeDefinition, WeeklyChallengeDefinition } from "../types";

const badgeName = (id: string) => id.split("-").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ");

export const buildBadgeCatalog = (
  fixed: FixedChallengeDefinition[],
  weekly: WeeklyChallengeDefinition[],
): BadgeCatalogItem[] => [...fixed, ...weekly].flatMap((challenge) => challenge.badgeId ? [{
  id: challenge.badgeId,
  challengeId: challenge.id,
  challengeTitle: challenge.title,
  name: badgeName(challenge.badgeId),
}] : []);
