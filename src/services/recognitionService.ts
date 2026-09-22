import { getSpeciesById, species } from "../data/species";
import type { AnalysisResult } from "../types";

export type RecognitionRequest = {
  fileName?: string;
  demoSpeciesId?: string;
};

export interface RecognitionService {
  identify(request: RecognitionRequest): Promise<AnalysisResult>;
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const identifyDemo = async ({
  fileName = "",
  demoSpeciesId,
}: RecognitionRequest): Promise<AnalysisResult> => {
  await wait(1550);

  const normalizedFileName = fileName.toLowerCase();
  const selectedDemoSpecies = demoSpeciesId ? getSpeciesById(demoSpeciesId) : undefined;
  const fileNameMatch = species.find((candidate) =>
    candidate.keywords.some((keyword) => normalizedFileName.includes(keyword.toLowerCase())),
  );

  if (fileNameMatch) {
    return {
      species: fileNameMatch,
      status: "demo-match",
      mode: "demo",
      analyzedAt: new Date().toISOString(),
      message:
        "Modo demo: se usó el nombre del archivo para elegir una ficha de muestra. No es una identificación por IA.",
    };
  }

  if (selectedDemoSpecies) {
    return {
      species: selectedDemoSpecies,
      status: "demo-sample",
      mode: "demo",
      analyzedAt: new Date().toISOString(),
      message:
        "Modo demo: elegiste esta especie para recorrer el flujo completo. No proviene de un modelo de reconocimiento.",
    };
  }

  return {
    status: "unrecognized",
    mode: "demo",
    analyzedAt: new Date().toISOString(),
    message:
      "Sin coincidencia demo. No se analizó el contenido de la foto; elegí una especie de prueba para recorrer el flujo.",
  };
};

export const demoRecognitionService: RecognitionService = { identify: identifyDemo };
export const identifySpecies = demoRecognitionService.identify;
