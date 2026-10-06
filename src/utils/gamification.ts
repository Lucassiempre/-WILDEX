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
  new Set(discoveries.map((discovery) => discovery.speciesId).filter((id) => Boolean(getSpeciesById(id))));

export const discoveredSpeciesCount = (discoveries: Discovery[]) => discoveredSpeciesIds(discoveries).size;

export const discoveredVariantCount = (discoveries: Discovery[]) =>
  new Set(discoveries.filter((item) => item.variantId).map((item) => `${item.speciesId}:${item.variantId}`)).size;

export const discoveredVariantIdsForSpecies = (discoveries: Discovery[], speciesId: string) =>
  new Set(discoveries.filter((item) => item.speciesId === speciesId && item.variantId).map((item) => item.variantId!));

export const categoryCounts = (discoveries: Discovery[]) =>
  categories.reduce<Record<string, number>>((accumulator, category) => {
    accumulator[category] = [...discoveredSpeciesIds(discoveries)].filter((id) => getSpeciesById(id)?.category === category).length;
    return accumulator;
  }, {});

export const achievementsForState = (state: ExplorerState) => {
  const counts = categoryCounts(state.discoveries);
  const total = discoveredSpeciesCount(state.discoveries);
  const urban = [...discoveredSpeciesIds(state.discoveries)].filter((id) => getSpeciesById(id)?.explorationTypes.includes("urban")).length;
  const wild = [...discoveredSpeciesIds(state.discoveries)].filter((id) => getSpeciesById(id)?.explorationTypes.includes("wild")).length;
  const night = state.discoveries.some((item) => {
    const hour = new Date(item.discoveredAt).getHours();
    return hour >= 20 || hour < 5;
  });
  return [
    {
      title: "Primer descubrimiento",
      description: "Registraste tu primera especie.",
      unlocked: total >= 1,
    },
    {
      title: "Explorador urbano",
      description: "Registraste tres especies urbanas distintas.",
      unlocked: urban >= 3,
    },
    {
      title: "Observador de aves",
      description: "Descubriste al menos un ave.",
      unlocked: counts.Aves >= 1,
    },
    {
      title: "Amante de los mamíferos",
      description: "Sumaste dos mamíferos a tu colección.",
      unlocked: counts.Mamíferos >= 2,
    },
    { title: "Observador de insectos", description: "Descubriste un insecto.", unlocked: counts.Insectos >= 1 },
    { title: "Explorador de mamíferos", description: "Registraste cinco mamíferos distintos.", unlocked: counts.Mamíferos >= 5 },
    { title: "Explorador silvestre", description: "Registraste una especie silvestre.", unlocked: wild >= 1 },
    {
      title: "Explorador nocturno",
      description: "Registraste una observación entre las 20 y las 5 h.",
      unlocked: night,
    },
    {
      title: "10 especies descubiertas",
      description: "Registraste diez especies distintas.",
      unlocked: total >= 10,
    },
    {
      title: "25 especies descubiertas",
      description: "Registraste veinticinco especies distintas.",
      unlocked: total >= 25,
    },
    {
      title: "50 especies descubiertas",
      description: "Registraste cincuenta especies distintas.",
      unlocked: total >= 50,
    },
    {
      title: "Primera variante",
      description: "Registraste una raza o variante declarada.",
      unlocked: discoveredVariantCount(state.discoveries) >= 1,
    },
  ];
};
