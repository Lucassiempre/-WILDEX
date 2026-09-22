export type Category = "Mamíferos" | "Aves" | "Reptiles" | "Anfibios" | "Peces" | "Arácnidos" | "Insectos" | "Otros invertebrados";
export type Exploration = "urbana" | "silvestre" | "ambas";
export type ExplorationType = "urban" | "wild" | "domestic";
export type SpeciesVariant = { id: string; name: string; kind: "raza" | "tipo" };

export type Species = {
  id: string;
  commonName: string;
  scientificName: string;
  category: Category;
  exploration: Exploration;
  explorationTypes: ExplorationType[];
  variants?: SpeciesVariant[];
  regions?: string[];
  distribution?: string;
  whereToFind?: string;
  conservationStatus?: string;
  funFacts?: string[];
  scienceSourceUrl?: string;
  image: string;
  description: string;
  habitat: string;
  diet: string;
  conservation?: string;
  curiosity: string;
  keywords: string[];
  rarity: "comun" | "notable" | "especial";
  sourceUrl: string;
};

export type Discovery = {
  id: string;
  speciesId: string;
  discoveredAt: string;
  variantId?: string;
  photo?: string;
  identificationMethod: "demo-manual" | "demo-filename" | "legacy";
  confidence?: number;
  notes?: string;
};

export type DiscoveryInput = {
  species: Species;
  variantId?: string;
  photo?: string;
  notes?: string;
  identificationMethod: Discovery["identificationMethod"];
};

export type ExplorerState = {
  discoveries: Discovery[];
  xp: number;
  awardedCategoryBonuses: Category[];
};

export type AnalysisResult = {
  species?: Species;
  status: "demo-match" | "demo-sample" | "unconfirmed" | "unrecognized" | "invalid-image" | "connection-error";
  mode: "demo";
  message: string;
  analyzedAt: string;
};

export type View = "inicio" | "descubrir" | "coleccion" | "perfil";
