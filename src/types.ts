export type Category = "Mamíferos" | "Aves" | "Reptiles" | "Anfibios" | "Peces" | "Arácnidos" | "Insectos" | "Otros invertebrados";
export type Exploration = "urbana" | "silvestre" | "ambas";
export type ExplorationType = "urban" | "wild" | "domestic";
export type SpeciesVariant = {
  id: string;
  name: string;
  kind: "raza" | "tipo" | "color" | "patron";
  description?: string;
  image?: string;
  sourceUrl?: string;
};
export type IdentificationMethod = "demo-manual" | "demo-filename" | "legacy" | "model";
export type ThematicCollection = {
  id: string;
  title: string;
  description: string;
  speciesIds: string[];
  progressMode: "species" | "variants";
  variantSpeciesId?: string;
};

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
  photoRef?: string;
  photo?: string;
  identificationMethod: IdentificationMethod;
  confidence?: number;
  notes?: string;
  customName?: string;
  remotePhoto?: RemotePhotoMetadata;
};

export type RemotePhotoMetadata = {
  path: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  sha256: string;
};

export type DiscoveryInput = {
  species: Species;
  variantId?: string;
  photoRef?: string;
  photo?: string;
  notes?: string;
  identificationMethod: Discovery["identificationMethod"];
};

export type ExplorerState = {
  discoveries: Discovery[];
  xp: number;
  awardedCategoryBonuses: Category[];
  claimedChallengeIds: string[];
  earnedBadgeIds: string[];
  badgeAwards: BadgeAward[];
};

export type BadgeAward = {
  badgeId: string;
  challengeId: string;
  earnedAt?: string;
};

export type AvatarConfig = {
  appearance: "classic" | "round" | "angular";
  skinTone: "light" | "medium" | "deep";
  hairStyle: "short" | "curly" | "long" | "shaved";
  hairColor: "brown" | "black" | "blonde" | "copper";
  outfit: "explorer" | "ranger" | "field";
  accessory: "none" | "cap" | "backpack" | "binoculars" | "camera" | "adventure-hat";
  background: "forest" | "mountain" | "river";
};

export type ExplorerProfile = {
  userId?: string;
  displayName: string;
  username: string;
  bio?: string;
  avatarConfig: AvatarConfig;
  favoriteSpeciesId?: string;
  featuredBadgeIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type AvatarAccess = "free" | "premium" | "challenge";
export type AvatarOption<T extends string> = { id: T; label: string; access: AvatarAccess };

export type BadgeCatalogItem = {
  id: string;
  challengeId: string;
  challengeTitle: string;
  name: string;
};

export type ChallengeObjective = {
  id: string;
  label: string;
  target: number;
} & (
  | { type: "unique-species" }
  | { type: "unique-variants"; speciesId?: string }
  | { type: "observation-count" }
  | { type: "category-species"; category: Category }
  | { type: "collection-species"; collectionId: string }
  | { type: "new-species" }
);

export type FixedChallengeDefinition = {
  id: string;
  title: string;
  description: string;
  objective: ChallengeObjective;
  xpReward: number;
  badgeId?: string;
};

export type WeeklyChallengeStatus = "draft" | "scheduled" | "published" | "archived";

export type WeeklyChallengeDefinition = {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  objectives: ChallengeObjective[];
  xpReward: number;
  badgeId?: string;
  status: WeeklyChallengeStatus;
};

export type ChallengePhase = "permanent" | "active" | "upcoming" | "ended";

export type ChallengeEvaluation = {
  id: string;
  title: string;
  description: string;
  kind: "fixed" | "weekly";
  phase: ChallengePhase;
  objectives: Array<ChallengeObjective & { current: number; completed: boolean }>;
  completed: boolean;
  claimed: boolean;
  xpReward: number;
  badgeId?: string;
  startDate?: string;
  endDate?: string;
};

export type AnalysisResult = {
  speciesId?: string;
  variantId?: string;
  speciesConfidence?: number;
  variantConfidence?: number;
  identificationMethod: IdentificationMethod;
  status: "demo-match" | "demo-sample" | "unconfirmed" | "unrecognized" | "invalid-image" | "connection-error";
  mode: "demo";
  message: string;
  analyzedAt: string;
};

export type View = "inicio" | "descubrir" | "coleccion" | "album" | "perfil";
