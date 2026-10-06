import type { AvatarConfig, AvatarOption } from "../types";

const free = <T extends string>(id: T, label: string): AvatarOption<T> => ({ id, label, access: "free" });

export const avatarOptions = {
  appearance: [free("classic", "Clásica"), free("round", "Redondeada"), free("angular", "Angular")],
  skinTone: [free("light", "Claro"), free("medium", "Medio"), free("deep", "Profundo")],
  hairStyle: [free("short", "Corto"), free("curly", "Rizado"), free("long", "Largo"), free("shaved", "Rapado")],
  hairColor: [free("brown", "Castaño"), free("black", "Negro"), free("blonde", "Rubio"), free("copper", "Cobrizo")],
  outfit: [free("explorer", "Exploración"), free("ranger", "Guardaparque"), free("field", "Trabajo de campo")],
  accessory: [free("none", "Sin accesorio"), free("cap", "Gorra"), free("backpack", "Mochila"), free("binoculars", "Binoculares"), free("camera", "Cámara"), free("adventure-hat", "Sombrero")],
  background: [free("forest", "Bosque"), free("mountain", "Montaña"), free("river", "Río")],
} satisfies { [K in keyof AvatarConfig]: AvatarOption<AvatarConfig[K]>[] };

export const defaultAvatarConfig: AvatarConfig = {
  appearance: "classic",
  skinTone: "medium",
  hairStyle: "short",
  hairColor: "brown",
  outfit: "explorer",
  accessory: "camera",
  background: "forest",
};
