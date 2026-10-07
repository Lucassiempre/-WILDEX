import type { Species, SpeciesVariant } from "../types";

export const normalizeCatalogSearch = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("es")
  .trim();

type RankedItem<T> = { item: T; rank: number; label: string };

const rankedSearch = <T>(
  items: T[],
  query: string,
  primary: (item: T) => string,
  secondary?: (item: T) => string | undefined,
  limit = 8,
) => {
  const normalizedQuery = normalizeCatalogSearch(query);
  const ranked = items.flatMap((item): RankedItem<T>[] => {
    const label = primary(item);
    const normalizedPrimary = normalizeCatalogSearch(label);
    const normalizedSecondary = normalizeCatalogSearch(secondary?.(item) ?? "");
    if (!normalizedQuery) return [{ item, rank: 3, label }];
    if (normalizedPrimary.startsWith(normalizedQuery)) return [{ item, rank: 0, label }];
    if (normalizedPrimary.includes(normalizedQuery)) return [{ item, rank: 1, label }];
    if (normalizedSecondary.includes(normalizedQuery)) return [{ item, rank: 2, label }];
    return [];
  });
  return ranked
    .sort((left, right) => left.rank - right.rank || left.label.localeCompare(right.label, "es"))
    .slice(0, limit)
    .map(({ item }) => item);
};

export const searchSpecies = (items: Species[], query: string, limit = 8) => rankedSearch(
  items,
  query,
  (item) => item.commonName,
  (item) => item.scientificName,
  limit,
);

export const searchVariants = (items: SpeciesVariant[], query: string, limit = 8) => rankedSearch(
  items,
  query,
  (item) => item.name,
  undefined,
  limit,
);
