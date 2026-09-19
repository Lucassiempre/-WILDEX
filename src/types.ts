export type Category = "Mamíferos" | "Aves" | "Reptiles" | "Anfibios" | "Insectos" | "Otros";

export type Species = {
  id: string;
  commonName: string;
  scientificName: string;
  category: Category;
  image: string;
  description: string;
  habitat: string;
  diet: string;
  conservation: string;
  curiosity: string;
  keywords: string[];
  rarity: "comun" | "notable" | "especial";
  sourceUrl: string;
};

export type Discovery = {
  speciesId: string;
  discoveredAt: string;
};

export type ExplorerState = {
  discoveries: Discovery[];
  xp: number;
  awardedCategoryBonuses: Category[];
};

export type AnalysisResult = {
  species?: Species;
  status: "demo-match" | "demo-sample" | "unconfirmed";
  mode: "demo";
  message: string;
  analyzedAt: string;
};

export type View = "inicio" | "descubrir" | "coleccion" | "perfil";
