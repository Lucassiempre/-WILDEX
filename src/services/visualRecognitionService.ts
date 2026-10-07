import type { SupabaseClient } from "@supabase/supabase-js";
import { getSpeciesById } from "../data/species";
import { getSupabaseClient } from "../lib/supabaseClient";
import type { RecognitionConfidence } from "../types";

export type VisualRecognitionResult = {
  detectedAnimal: boolean;
  commonName: string | null;
  scientificName: string | null;
  possibleSpeciesId: string | null;
  confidence: RecognitionConfidence;
  matchesSelectedSpecies: boolean | null;
  reason: string;
};

export class VisualRecognitionError extends Error {
  constructor(public code: "not-authenticated" | "timeout" | "network" | "invalid-response") {
    super(code);
    this.name = "VisualRecognitionError";
  }
}

type RecognitionClient = Pick<SupabaseClient, "auth" | "functions">;
const confidenceValues = new Set<RecognitionConfidence>(["high", "medium", "low", "unknown"]);

export const validateVisualRecognitionResult = (value: unknown, selectedSpeciesId?: string): VisualRecognitionResult => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new VisualRecognitionError("invalid-response");
  const raw = value as Record<string, unknown>;
  if (typeof raw.detectedAnimal !== "boolean" || !confidenceValues.has(raw.confidence as RecognitionConfidence)
    || typeof raw.reason !== "string" || raw.reason.length === 0) throw new VisualRecognitionError("invalid-response");
  const commonName = typeof raw.commonName === "string" && raw.commonName.trim() ? raw.commonName.trim() : null;
  const scientificName = typeof raw.scientificName === "string" && raw.scientificName.trim() ? raw.scientificName.trim() : null;
  const requestedId = typeof raw.possibleSpeciesId === "string" ? raw.possibleSpeciesId : null;
  const possibleSpeciesId = requestedId && getSpeciesById(requestedId) ? requestedId : null;
  if (raw.detectedAnimal && !commonName && !scientificName) throw new VisualRecognitionError("invalid-response");
  return {
    detectedAnimal: raw.detectedAnimal,
    commonName: raw.detectedAnimal ? commonName : null,
    scientificName: raw.detectedAnimal ? scientificName : null,
    possibleSpeciesId,
    confidence: raw.confidence as RecognitionConfidence,
    matchesSelectedSpecies: selectedSpeciesId && possibleSpeciesId ? selectedSpeciesId === possibleSpeciesId : null,
    reason: raw.reason.trim().slice(0, 320),
  };
};

export const identifyAnimalPhoto = async ({
  imageDataUrl,
  selectedSpeciesId,
  signal,
  timeoutMs = 20_000,
  client = getSupabaseClient(),
}: {
  imageDataUrl: string;
  selectedSpeciesId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  client?: RecognitionClient;
}): Promise<VisualRecognitionResult> => {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError || !sessionData.session?.user) throw new VisualRecognitionError("not-authenticated");
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { data, error } = await client.functions.invoke<{ ok?: boolean; result?: unknown }>("identify-animal", {
      body: { imageDataUrl, selectedSpeciesId: selectedSpeciesId || undefined },
      signal: controller.signal,
      timeout: timeoutMs,
    });
    if (error) {
      if (controller.signal.aborted || error.message?.toLowerCase().includes("abort") || error.message?.toLowerCase().includes("timeout")) {
        throw new VisualRecognitionError("timeout");
      }
      throw new VisualRecognitionError("network");
    }
    if (!data?.ok) throw new VisualRecognitionError("invalid-response");
    return validateVisualRecognitionResult(data.result, selectedSpeciesId);
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
};

export const createRecognitionRequestGuard = () => {
  let active: { token: string; photo: string; controller: AbortController } | undefined;
  return {
    begin(photo: string) {
      active?.controller.abort();
      active = { token: crypto.randomUUID(), photo, controller: new AbortController() };
      return { token: active.token, signal: active.controller.signal };
    },
    isCurrent(token: string, photo: string) {
      return Boolean(active && active.token === token && active.photo === photo && !active.controller.signal.aborted);
    },
    finish(token: string) {
      if (active?.token === token) active = undefined;
    },
    cancel() {
      active?.controller.abort();
      active = undefined;
    },
  };
};
