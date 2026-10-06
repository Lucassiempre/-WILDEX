import type { FixedChallengeDefinition, WeeklyChallengeDefinition } from "../types";

export const fixedChallenges: FixedChallengeDefinition[] = [
  { id: "fixed-first-species", title: "Primer descubrimiento", description: "Descubrí tu primera especie.", objective: { id: "species", type: "unique-species", label: "Especies diferentes", target: 1 }, xpReward: 50, badgeId: "primer-descubrimiento" },
  { id: "fixed-first-bird", title: "Tu primera ave", description: "Descubrí una especie de ave.", objective: { id: "birds", type: "category-species", category: "Aves", label: "Aves diferentes", target: 1 }, xpReward: 50, badgeId: "observador-aves" },
  { id: "fixed-urban-three", title: "Exploración urbana", description: "Registrá tres aves de la colección urbana.", objective: { id: "urban", type: "collection-species", collectionId: "aves-urbanas", label: "Aves urbanas", target: 3 }, xpReward: 75, badgeId: "explorador-urbano" },
  { id: "fixed-first-insect", title: "Pequeños habitantes", description: "Descubrí una especie de insecto.", objective: { id: "insects", type: "category-species", category: "Insectos", label: "Insectos diferentes", target: 1 }, xpReward: 50, badgeId: "observador-insectos" },
  { id: "fixed-five-mammals", title: "Cinco mamíferos", description: "Descubrí cinco especies de mamíferos.", objective: { id: "mammals", type: "category-species", category: "Mamíferos", label: "Mamíferos diferentes", target: 5 }, xpReward: 100, badgeId: "explorador-mamiferos" },
  { id: "fixed-first-wild", title: "Naturaleza abierta", description: "Registrá una especie de la colección de animales de zoológico o reserva.", objective: { id: "zoo-first", type: "collection-species", collectionId: "zoologico", label: "Especies de zoológico", target: 1 }, xpReward: 50, badgeId: "explorador-silvestre" },
  { id: "fixed-five-dog-breeds", title: "Compañeros caninos", description: "Registrá cinco razas o tipos distintos de perro.", objective: { id: "dog-variants", type: "unique-variants", speciesId: "perro-domestico", label: "Variantes de perro", target: 5 }, xpReward: 150, badgeId: "guia-canina" },
  { id: "fixed-five-cat-breeds", title: "Mundo felino", description: "Registrá cinco razas o tipos distintos de gato.", objective: { id: "cat-variants", type: "unique-variants", speciesId: "gato-domestico", label: "Variantes de gato", target: 5 }, xpReward: 150, badgeId: "guia-felina" },
  { id: "fixed-ten-urban-birds", title: "Aves de la ciudad", description: "Descubrí diez especies de la colección Aves urbanas.", objective: { id: "urban-birds", type: "collection-species", collectionId: "aves-urbanas", label: "Aves urbanas", target: 10 }, xpReward: 250, badgeId: "naturalista-urbano" },
  { id: "fixed-fifteen-zoo", title: "Vuelta al bioparque", description: "Descubrí quince especies de la colección Animales de zoológico.", objective: { id: "zoo", type: "collection-species", collectionId: "zoologico", label: "Especies de zoológico", target: 15 }, xpReward: 350, badgeId: "explorador-bioparque" },
  { id: "fixed-fifty-species", title: "Gran colección", description: "Descubrí cincuenta especies diferentes.", objective: { id: "species", type: "unique-species", label: "Especies diferentes", target: 50 }, xpReward: 500, badgeId: "coleccionista-50" },
  { id: "fixed-hundred-species", title: "Naturalista experto", description: "Descubrí cien especies diferentes.", objective: { id: "species", type: "unique-species", label: "Especies diferentes", target: 100 }, xpReward: 1000, badgeId: "coleccionista-100" },
];

// Para agregar un evento, incorporá otro objeto con ID estable, fechas ISO y objetivos tipados.
// Sólo los eventos "published" pueden completarse y entregar recompensas.
export const weeklyChallenges: WeeklyChallengeDefinition[] = [
  {
    id: "weekly-urban-birds-2026-09-21",
    title: "Aves en movimiento",
    description: "Observá aves urbanas durante esta semana.",
    startDate: "2026-09-21T00:00:00-03:00",
    endDate: "2026-09-27T23:59:59-03:00",
    objectives: [
      { id: "urban-birds", type: "collection-species", collectionId: "aves-urbanas", label: "Aves urbanas diferentes", target: 3 },
      { id: "observations", type: "observation-count", label: "Observaciones durante el evento", target: 5 },
    ],
    xpReward: 300,
    badgeId: "semana-aves-urbanas-2026",
    status: "published",
  },
  {
    id: "weekly-spring-2026-10-05",
    title: "Exploración de primavera",
    description: "Prepará una nueva salida de observación.",
    startDate: "2026-10-05T00:00:00-03:00",
    endDate: "2026-10-11T23:59:59-03:00",
    objectives: [
      { id: "new-species", type: "new-species", label: "Especies nuevas durante el evento", target: 2 },
      { id: "observations", type: "observation-count", label: "Observaciones durante el evento", target: 4 },
    ],
    xpReward: 250,
    badgeId: "primavera-2026",
    status: "scheduled",
  },
  {
    id: "weekly-variants-2026-09-07",
    title: "Semana de las variantes",
    description: "Registrá variantes diferentes durante el período.",
    startDate: "2026-09-07T00:00:00-03:00",
    endDate: "2026-09-13T23:59:59-03:00",
    objectives: [{ id: "variants", type: "unique-variants", label: "Variantes diferentes", target: 2 }],
    xpReward: 200,
    badgeId: "variantes-semanales-2026",
    status: "published",
  },
];
