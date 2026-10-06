import { getSpeciesById } from "../data/species";
import type { Discovery, Species, ThematicCollection } from "../types";
import { discoveredSpeciesIds, discoveredVariantIdsForSpecies } from "./gamification";

export type CollectionProgress = { current: number; total: number; percentage: number };

export const speciesForThematicCollection = (collection: ThematicCollection) =>
  collection.speciesIds.map(getSpeciesById).filter((item): item is Species => Boolean(item));

export const thematicCollectionProgress = (collection: ThematicCollection, discoveries: Discovery[]): CollectionProgress => {
  if (collection.progressMode === "variants" && collection.variantSpeciesId) {
    const item = getSpeciesById(collection.variantSpeciesId);
    const validIds = new Set(item?.variants?.map((variant) => variant.id) ?? []);
    const current = [...discoveredVariantIdsForSpecies(discoveries, collection.variantSpeciesId)].filter((id) => validIds.has(id)).length;
    const total = validIds.size;
    return { current, total, percentage: total ? Math.round(100 * current / total) : 0 };
  }

  const discoveredIds = discoveredSpeciesIds(discoveries);
  const validIds = collection.speciesIds.filter((id) => Boolean(getSpeciesById(id)));
  const current = validIds.filter((id) => discoveredIds.has(id)).length;
  return { current, total: validIds.length, percentage: validIds.length ? Math.round(100 * current / validIds.length) : 0 };
};
