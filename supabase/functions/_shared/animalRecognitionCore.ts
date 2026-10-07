export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_REQUEST_CHARACTERS = 7_100_000;
export const GEMINI_TIMEOUT_MS = 20_000;

export type RecognitionConfidence = "high" | "medium" | "low" | "unknown";

export type CatalogSpecies = {
  id: string;
  common_name: string;
  scientific_name: string;
  keywords?: string[] | null;
};

export type ParsedImage = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
  sizeBytes: number;
};

export type ProviderAnimalResult = {
  detectedAnimal: boolean;
  commonName: string | null;
  scientificName: string | null;
  confidence: RecognitionConfidence;
  reason: string;
};

export type AnimalRecognitionResult = ProviderAnimalResult & {
  possibleSpeciesId: string | null;
  matchesSelectedSpecies: boolean | null;
};

export class AnimalRecognitionError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
    this.name = "AnimalRecognitionError";
  }
}

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const confidenceValues = new Set<RecognitionConfidence>(["high", "medium", "low", "unknown"]);

const cleanText = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return cleaned || null;
};

const normalizedText = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

export const parseImageDataUrl = (value: unknown): ParsedImage => {
  if (typeof value !== "string") throw new AnimalRecognitionError("invalid_image", 400);
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || !allowedMimeTypes.has(match[1])) throw new AnimalRecognitionError("unsupported_image", 415);
  const base64 = match[2];
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const sizeBytes = Math.floor((base64.length * 3) / 4) - padding;
  if (!sizeBytes) throw new AnimalRecognitionError("empty_image", 400);
  if (sizeBytes > MAX_IMAGE_BYTES) throw new AnimalRecognitionError("image_too_large", 413);
  return { mimeType: match[1] as ParsedImage["mimeType"], base64, sizeBytes };
};

export const sanitizeProviderResult = (value: unknown): ProviderAnimalResult => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AnimalRecognitionError("invalid_provider_response", 502);
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.detectedAnimal !== "boolean" || !confidenceValues.has(raw.confidence as RecognitionConfidence)) {
    throw new AnimalRecognitionError("invalid_provider_response", 502);
  }
  const reason = cleanText(raw.reason, 320);
  if (!reason) throw new AnimalRecognitionError("invalid_provider_response", 502);
  const commonName = cleanText(raw.commonName, 120);
  const scientificName = cleanText(raw.scientificName, 160);
  if (raw.detectedAnimal && !commonName && !scientificName) {
    throw new AnimalRecognitionError("invalid_provider_response", 502);
  }
  return {
    detectedAnimal: raw.detectedAnimal,
    commonName: raw.detectedAnimal ? commonName : null,
    scientificName: raw.detectedAnimal ? scientificName : null,
    confidence: raw.confidence as RecognitionConfidence,
    reason,
  };
};

export const matchCatalogSpecies = (
  result: ProviderAnimalResult,
  catalog: CatalogSpecies[],
): CatalogSpecies | undefined => {
  if (!result.detectedAnimal || !["high", "medium"].includes(result.confidence)) return undefined;
  const names = [result.scientificName, result.commonName]
    .filter((value): value is string => Boolean(value))
    .map(normalizedText);
  if (!names.length) return undefined;

  const matches = catalog.filter((item) => {
    const aliases = [item.scientific_name, item.common_name, ...(item.keywords ?? [])].map(normalizedText);
    return names.some((name) => aliases.includes(name));
  });
  return matches.length === 1 ? matches[0] : undefined;
};

export const normalizeAnimalRecognition = (
  providerResult: ProviderAnimalResult,
  catalog: CatalogSpecies[],
  selectedSpeciesId?: string,
): AnimalRecognitionResult => {
  const match = matchCatalogSpecies(providerResult, catalog);
  return {
    ...providerResult,
    possibleSpeciesId: match?.id ?? null,
    matchesSelectedSpecies: selectedSpeciesId && match ? selectedSpeciesId === match.id : null,
  };
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type GeminiDiagnostics = {
  onStart?: (details: { model: string; timestamp: string }) => void;
  onResponse?: (details: { status: number | null; durationMs: number }) => void;
  onJsonParsed?: (details: { success: boolean }) => void;
};

export const recognizeWithGemini = async ({
  apiKey,
  model = DEFAULT_GEMINI_MODEL,
  image,
  fetcher = fetch,
  signal,
  diagnostics,
}: {
  apiKey?: string;
  model?: string;
  image: ParsedImage;
  fetcher?: FetchLike;
  signal?: AbortSignal;
  diagnostics?: GeminiDiagnostics;
}): Promise<ProviderAnimalResult> => {
  if (!apiKey) throw new AnimalRecognitionError("gemini_not_configured", 500);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const providerStartedAt = Date.now();
  diagnostics?.onStart?.({ model, timestamp: new Date(providerStartedAt).toISOString() });
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal,
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: "Analizá la fotografía. Indicá si muestra un animal. Si es posible, nombrá la especie en español y su nombre científico. No identifiques raza, variedad ni individuo. Si la imagen es ambigua, usá confianza low o unknown. Respondé solamente con el JSON solicitado." },
            { inlineData: { mimeType: image.mimeType, data: image.base64 } },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 300,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              detectedAnimal: { type: "BOOLEAN" },
              commonName: { type: "STRING", nullable: true },
              scientificName: { type: "STRING", nullable: true },
              confidence: { type: "STRING", enum: ["high", "medium", "low", "unknown"] },
              reason: { type: "STRING" },
            },
            required: ["detectedAnimal", "commonName", "scientificName", "confidence", "reason"],
          },
        },
      }),
    });
  } catch (error) {
    diagnostics?.onResponse?.({ status: null, durationMs: Date.now() - providerStartedAt });
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new AnimalRecognitionError("provider_timeout", 504);
    }
    throw new AnimalRecognitionError("provider_unavailable", 502);
  }
  diagnostics?.onResponse?.({ status: response.status, durationMs: Date.now() - providerStartedAt });
  if (!response.ok) throw new AnimalRecognitionError(response.status === 429 ? "provider_rate_limited" : "provider_error", 502);

  const payload = await response.json().catch(() => undefined) as Record<string, unknown> | undefined;
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const candidate = candidates[0] as { content?: { parts?: Array<{ text?: unknown }> } } | undefined;
  const text = candidate?.content?.parts?.find((part) => typeof part.text === "string")?.text;
  if (typeof text !== "string") {
    diagnostics?.onJsonParsed?.({ success: false });
    throw new AnimalRecognitionError("invalid_provider_response", 502);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    diagnostics?.onJsonParsed?.({ success: false });
    throw new AnimalRecognitionError("invalid_provider_response", 502);
  }
  diagnostics?.onJsonParsed?.({ success: true });
  return sanitizeProviderResult(parsed);
};

export type AnimalRecognitionDependencies = {
  verifyToken: (token: string) => Promise<{ userId?: string; error?: unknown }>;
  listCatalog: () => Promise<{ data?: CatalogSpecies[] | null; error?: unknown }>;
  recognize: (image: ParsedImage, signal?: AbortSignal) => Promise<ProviderAnimalResult>;
};

export const executeAnimalRecognitionRequest = async (
  input: { method: string; authorization?: string | null; body?: unknown; signal?: AbortSignal },
  dependencies: AnimalRecognitionDependencies,
) => {
  if (input.method !== "POST") return { status: 405, body: { ok: false, error: "method_not_allowed" } };
  const token = input.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { status: 401, body: { ok: false, error: "not_authenticated" } };
  const verified = await dependencies.verifyToken(token);
  if (verified.error || !verified.userId) return { status: 401, body: { ok: false, error: "invalid_session" } };

  try {
    const body = input.body && typeof input.body === "object" ? input.body as Record<string, unknown> : {};
    const image = parseImageDataUrl(body.imageDataUrl);
    const selectedSpeciesId = typeof body.selectedSpeciesId === "string" && body.selectedSpeciesId.length <= 160
      ? body.selectedSpeciesId
      : undefined;
    const catalogResult = await dependencies.listCatalog();
    if (catalogResult.error || !Array.isArray(catalogResult.data)) throw new AnimalRecognitionError("catalog_unavailable", 502);
    const providerResult = await dependencies.recognize(image, input.signal);
    return { status: 200, body: { ok: true, result: normalizeAnimalRecognition(providerResult, catalogResult.data, selectedSpeciesId) } };
  } catch (error) {
    const recognized = error instanceof AnimalRecognitionError ? error : new AnimalRecognitionError("recognition_failed", 500);
    return { status: recognized.status, body: { ok: false, error: recognized.code } };
  }
};
