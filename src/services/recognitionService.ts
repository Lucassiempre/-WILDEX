import { getSpeciesById, species } from "../data/species";
import type { AnalysisResult } from "../types";
import { identifyAnimalPhoto, VisualRecognitionError } from "./visualRecognitionService";

export type RecognitionRequest = {
  fileName?: string;
  demoSpeciesId?: string;
  imageDataUrl?: string;
  signal?: AbortSignal;
};

export interface RecognitionService {
  identify(request: RecognitionRequest): Promise<AnalysisResult>;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const identifyDemo = async ({
  fileName = "",
  demoSpeciesId,
}: RecognitionRequest): Promise<AnalysisResult> => {
  await wait(1550);

  const normalizedFileName = fileName.toLowerCase();
  const selectedDemoSpecies = demoSpeciesId ? getSpeciesById(demoSpeciesId) : undefined;
  const fileNameMatch = species.find((candidate) =>
    candidate.keywords.some((keyword) => normalizedFileName.includes(keyword.toLowerCase())),
  );

  if (selectedDemoSpecies) {
    return {
      speciesId: selectedDemoSpecies.id,
      status: "demo-sample",
      mode: "demo",
      identificationMethod: "demo-manual",
      analyzedAt: new Date().toISOString(),
      message:
        "Modo demo: elegiste esta especie para recorrer el flujo completo. No proviene de un modelo de reconocimiento.",
    };
  }

  if (fileNameMatch) {
    return {
      speciesId: fileNameMatch.id,
      status: "demo-match",
      mode: "demo",
      identificationMethod: "demo-filename",
      analyzedAt: new Date().toISOString(),
      message:
        "Modo demo: se usó el nombre del archivo para elegir una ficha de muestra. No es una identificación por IA.",
    };
  }

  return {
    status: "unrecognized",
    mode: "demo",
    identificationMethod: "demo-manual",
    analyzedAt: new Date().toISOString(),
    message:
      "Sin coincidencia demo. No se analizó el contenido de la foto; elegí una especie de prueba para recorrer el flujo.",
  };
};

export const demoRecognitionService: RecognitionService = { identify: identifyDemo };

export const confirmedSpeciesIdForAnalysis = (
  analysis: AnalysisResult,
  manuallySelectedSpeciesId?: string,
) => analysis.mode === "model"
  ? analysis.matchesSelectedSpecies === false && manuallySelectedSpeciesId
    ? manuallySelectedSpeciesId
    : analysis.speciesId ?? ""
  : analysis.speciesId ?? manuallySelectedSpeciesId ?? "";

export type VerificationStatus = "not_verified" | "verifying" | "verified_match" | "verified_mismatch" | "verification_unavailable";

export type VerificationEvent =
  | { type: "verification_started" }
  | { type: "analysis_received"; analysis: AnalysisResult }
  | { type: "species_changed" }
  | { type: "photo_changed" }
  | { type: "detected_species_accepted" };

export const verificationStatusForAnalysis = (analysis: AnalysisResult): VerificationStatus => {
  if (analysis.mode === "demo" && analysis.status !== "invalid-image" && analysis.status !== "unconfirmed") {
    return "verification_unavailable";
  }
  if (analysis.mode === "model" && analysis.status === "model-match" && analysis.matchesSelectedSpecies === true) {
    return "verified_match";
  }
  if (analysis.mode === "model") return "verified_mismatch";
  return "not_verified";
};

export const nextVerificationStatus = (event: VerificationEvent): VerificationStatus => {
  if (event.type === "verification_started") return "verifying";
  if (event.type === "analysis_received") return verificationStatusForAnalysis(event.analysis);
  if (event.type === "detected_species_accepted") return "verified_match";
  return "not_verified";
};

export const canSaveObservation = ({
  hasPhoto,
  selectedSpeciesId,
  verificationStatus,
}: {
  hasPhoto: boolean;
  selectedSpeciesId?: string;
  verificationStatus: VerificationStatus;
}) => hasPhoto
  && Boolean(selectedSpeciesId)
  && (verificationStatus === "verified_match" || verificationStatus === "verification_unavailable");

export const canVerifySelectedSpecies = ({
  hasPhoto,
  selectedSpeciesId,
  busy,
}: {
  hasPhoto: boolean;
  selectedSpeciesId?: string;
  busy: boolean;
}) => hasPhoto && Boolean(selectedSpeciesId) && !busy;

const fallbackMessage = (error: unknown) => {
  if (error instanceof VisualRecognitionError && error.code === "not-authenticated") {
    return "Iniciá sesión para usar el reconocimiento visual. Podés seleccionar la especie manualmente y continuar.";
  }
  if (error instanceof VisualRecognitionError && error.code === "timeout") {
    return "El reconocimiento tardó demasiado. La fotografía sigue disponible y podés identificarla manualmente.";
  }
  return "No se pudo completar el reconocimiento visual. La fotografía sigue disponible y podés identificarla manualmente.";
};

export const identifySpecies = async (request: RecognitionRequest): Promise<AnalysisResult> => {
  if (request.imageDataUrl && !request.demoSpeciesId) {
    return {
      status: "unconfirmed",
      mode: "demo",
      identificationMethod: "demo-manual",
      analyzedAt: new Date().toISOString(),
      message: "Seleccioná una especie para verificar la foto.",
    };
  }
  if (!request.imageDataUrl) return identifyDemo(request);
  try {
    const visual = await identifyAnimalPhoto({
      imageDataUrl: request.imageDataUrl,
      selectedSpeciesId: request.demoSpeciesId,
      signal: request.signal,
    });
    return {
      speciesId: visual.possibleSpeciesId ?? undefined,
      detectedAnimal: visual.detectedAnimal,
      detectedCommonName: visual.commonName ?? undefined,
      detectedScientificName: visual.scientificName ?? undefined,
      recognitionConfidence: visual.confidence,
      matchesSelectedSpecies: visual.matchesSelectedSpecies,
      status: !visual.detectedAnimal ? "not-animal" : visual.possibleSpeciesId ? "model-match" : "model-no-catalog",
      mode: "model",
      identificationMethod: "model",
      analyzedAt: new Date().toISOString(),
      message: visual.reason,
    };
  } catch (error) {
    if (request.signal?.aborted) throw error;
    const fallback = await identifyDemo(request);
    return { ...fallback, status: fallback.speciesId ? fallback.status : "connection-error", message: fallbackMessage(error) };
  }
};
