import { avatarOptions, defaultAvatarConfig } from "../data/avatarOptions";
import type { AvatarConfig, ExplorerProfile } from "../types";

export const EXPLORER_PROFILE_V1_KEY = "wildex-explorer-profile-v1";

export const createDefaultProfile = (now = new Date()): ExplorerProfile => ({
  userId: undefined,
  displayName: "Martina",
  username: "martina",
  bio: undefined,
  avatarConfig: { ...defaultAvatarConfig },
  favoriteSpeciesId: undefined,
  featuredBadgeIds: [],
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
});

const optionValue = <K extends keyof AvatarConfig>(key: K, value: unknown): AvatarConfig[K] => {
  const match = avatarOptions[key].find((option) => option.id === value);
  return (match?.id ?? defaultAvatarConfig[key]) as AvatarConfig[K];
};

export const normalizeProfile = (value: unknown, now = new Date()): ExplorerProfile => {
  const fallback = createDefaultProfile(now);
  if (!value || typeof value !== "object") return fallback;
  const profile = value as Partial<ExplorerProfile>;
  const avatar = profile.avatarConfig ?? fallback.avatarConfig;
  return {
    userId: typeof profile.userId === "string" ? profile.userId : undefined,
    displayName: typeof profile.displayName === "string" && profile.displayName.trim() ? profile.displayName.trim().slice(0, 40) : fallback.displayName,
    username: typeof profile.username === "string" && profile.username.trim() ? profile.username.trim().slice(0, 20) : fallback.username,
    bio: typeof profile.bio === "string" && profile.bio.trim() ? profile.bio.trim().slice(0, 160) : undefined,
    avatarConfig: {
      appearance: optionValue("appearance", avatar.appearance),
      skinTone: optionValue("skinTone", avatar.skinTone),
      hairStyle: optionValue("hairStyle", avatar.hairStyle),
      hairColor: optionValue("hairColor", avatar.hairColor),
      outfit: optionValue("outfit", avatar.outfit),
      accessory: optionValue("accessory", avatar.accessory),
      background: optionValue("background", avatar.background),
    },
    favoriteSpeciesId: typeof profile.favoriteSpeciesId === "string" ? profile.favoriteSpeciesId : undefined,
    featuredBadgeIds: Array.isArray(profile.featuredBadgeIds)
      ? [...new Set(profile.featuredBadgeIds.filter((item): item is string => typeof item === "string"))].slice(0, 3)
      : [],
    createdAt: typeof profile.createdAt === "string" && Number.isFinite(Date.parse(profile.createdAt)) ? profile.createdAt : fallback.createdAt,
    updatedAt: typeof profile.updatedAt === "string" && Number.isFinite(Date.parse(profile.updatedAt)) ? profile.updatedAt : fallback.updatedAt,
  };
};

export const validateProfile = (
  input: ExplorerProfile,
  discoveredSpeciesIds: Set<string>,
  earnedBadgeIds: Set<string>,
  now = new Date(),
): { profile?: ExplorerProfile; errors: Record<string, string> } => {
  const errors: Record<string, string> = {};
  const username = input.username.trim();
  const displayName = input.displayName.trim();
  if (username.length < 3 || username.length > 20) errors.username = "Usá entre 3 y 20 caracteres.";
  if (!displayName) errors.displayName = "Ingresá un nombre visible.";
  if (displayName.length > 40) errors.displayName = "El nombre visible admite hasta 40 caracteres.";
  if ((input.bio?.trim().length ?? 0) > 160) errors.bio = "La biografía admite hasta 160 caracteres.";
  if (input.favoriteSpeciesId && !discoveredSpeciesIds.has(input.favoriteSpeciesId)) errors.favoriteSpeciesId = "Elegí una especie descubierta.";
  const featuredBadgeIds = [...new Set(input.featuredBadgeIds)];
  if (featuredBadgeIds.length > 3 || featuredBadgeIds.some((id) => !earnedBadgeIds.has(id))) errors.featuredBadgeIds = "Elegí hasta tres insignias obtenidas.";
  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    profile: normalizeProfile({
      ...input,
      username,
      displayName,
      bio: input.bio?.trim() || undefined,
      featuredBadgeIds,
      updatedAt: now.toISOString(),
    }, now),
  };
};

export const loadExplorerProfile = (): ExplorerProfile => {
  try {
    const raw = localStorage.getItem(EXPLORER_PROFILE_V1_KEY);
    return raw ? normalizeProfile(JSON.parse(raw)) : createDefaultProfile();
  } catch {
    return createDefaultProfile();
  }
};

export const saveExplorerProfile = (profile: ExplorerProfile): boolean => {
  try {
    localStorage.setItem(EXPLORER_PROFILE_V1_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
};
