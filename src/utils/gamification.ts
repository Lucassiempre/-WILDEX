import { categories, getSpeciesById } from "../data/species";
import type { Discovery, ExplorerState } from "../types";

export const levelFromXp = (xp: number) => {
  const level = Math.floor(xp / 250) + 1;
  const currentLevelXp = xp % 250;
  return {
    level,
    currentLevelXp,
    nextLevelXp: 250,
    progress: Math.min(100, Math.round((currentLevelXp / 250) * 100)),
  };
};

export const discoveredSpeciesIds = (discoveries: Discovery[]) =>
  new Set(discoveries.map((discovery) => discovery.speciesId));

export const categoryCounts = (discoveries: Discovery[]) =>
  categories.reduce<Record<string, number>>((accumulator, category) => {
    accumulator[category] = discoveries.filter((discovery) => getSpeciesById(discovery.speciesId)?.category === category).length;
    return accumulator;
  }, {});

export const achievementsForState = (state: ExplorerState) => {
  const counts = categoryCounts(state.discoveries);
  const total = state.discoveries.length;
  return [
    {
      title: "Primer descubrimiento",
      description: "Registraste tu primera especie.",
      unlocked: total >= 1,
    },
    {
      title: "Explorador de aves",
      description: "Descubriste al menos un ave.",
      unlocked: counts.Aves >= 1,
    },
    {
      title: "Amante de los mamíferos",
      description: "Sumaste dos mamíferos a tu colección.",
      unlocked: counts.Mamíferos >= 2,
    },
    {
      title: "10 especies descubiertas",
      description: "Completaste la base demo inicial.",
      unlocked: total >= 10,
    },
    {
      title: "Explorador de la naturaleza",
      description: "Alcanzaste cinco especies distintas.",
      unlocked: total >= 5,
    },
  ];
};
