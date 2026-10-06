import { getSpeciesById } from "../data/species";
import type { Discovery, Species } from "../types";

export type SpeciesAlbum = {
  species: Species;
  photos: Discovery[];
  latestAt: string;
};

export const photoDiscoveries = (discoveries: Discovery[]) =>
  discoveries
    .filter((item) => Boolean((item.photo || item.photoRef || item.remotePhoto) && getSpeciesById(item.speciesId)))
    .sort((a, b) => Date.parse(b.discoveredAt) - Date.parse(a.discoveredAt));

export const buildSpeciesAlbums = (discoveries: Discovery[]): SpeciesAlbum[] => {
  const grouped = new Map<string, Discovery[]>();
  for (const discovery of photoDiscoveries(discoveries)) {
    const current = grouped.get(discovery.speciesId) ?? [];
    current.push(discovery);
    grouped.set(discovery.speciesId, current);
  }

  return [...grouped.entries()].flatMap(([speciesId, photos]) => {
    const item = getSpeciesById(speciesId);
    return item ? [{ species: item, photos, latestAt: photos[0].discoveredAt }] : [];
  }).sort((a, b) => Date.parse(b.latestAt) - Date.parse(a.latestAt));
};

export const photographedSpeciesCount = (discoveries: Discovery[]) =>
  buildSpeciesAlbums(discoveries).length;

export const registeredVariantIds = (photos: Discovery[]) =>
  [...new Set(photos.flatMap((item) => item.variantId ? [item.variantId] : []))];
