import type { Discovery, DiscoveryInput, ExplorerState } from "../types";

export type DiscoveryKind = "species" | "variant" | "observation";

export type DiscoveryUpdate = {
  state: ExplorerState;
  discovery: Discovery;
  kind: DiscoveryKind;
  xpAwarded: number;
};

export type DiscoveryDetails = Pick<Discovery, "customName" | "notes">;

type DiscoveryFactoryOptions = {
  id?: string;
  discoveredAt?: string;
};

export function createDiscoveryUpdate(
  state: ExplorerState,
  input: DiscoveryInput,
  options: DiscoveryFactoryOptions = {},
): DiscoveryUpdate {
  const alreadyDiscovered = state.discoveries.some((item) => item.speciesId === input.species.id);
  const variant = input.species.variants?.find((item) => item.id === input.variantId);
  const isNewVariant = Boolean(
    variant
      && !state.discoveries.some(
        (item) => item.speciesId === input.species.id && item.variantId === variant.id,
      ),
  );
  const hasCategoryBonus = state.awardedCategoryBonuses.includes(input.species.category);
  const speciesXp = alreadyDiscovered ? 0 : state.discoveries.length === 0 ? 100 : 50;
  const categoryXp = alreadyDiscovered || hasCategoryBonus ? 0 : 75;
  const variantXp = isNewVariant ? 20 : 0;
  const xpAwarded = speciesXp + categoryXp + variantXp;

  const discovery: Discovery = {
    id: options.id ?? crypto.randomUUID(),
    speciesId: input.species.id,
    variantId: variant?.id,
    discoveredAt: options.discoveredAt ?? new Date().toISOString(),
    photoRef: input.photoRef,
    photo: input.photo,
    notes: input.notes?.trim() || undefined,
    identificationMethod: input.identificationMethod,
  };

  return {
    discovery,
    kind: !alreadyDiscovered ? "species" : isNewVariant ? "variant" : "observation",
    xpAwarded,
    state: {
      ...state,
      discoveries: [...state.discoveries, discovery],
      xp: state.xp + xpAwarded,
      awardedCategoryBonuses: !alreadyDiscovered && !hasCategoryBonus
        ? [...state.awardedCategoryBonuses, input.species.category]
        : state.awardedCategoryBonuses,
    },
  };
}

export function updateDiscoveryDetails(
  state: ExplorerState,
  discoveryId: string,
  details: DiscoveryDetails,
): ExplorerState {
  return {
    ...state,
    discoveries: state.discoveries.map((item) => item.id === discoveryId ? {
      ...item,
      customName: details.customName?.trim() || undefined,
      notes: details.notes?.trim() || undefined,
    } : item),
  };
}
