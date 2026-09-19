import { getSpeciesById, species } from "../data/species";
import type { AnalysisResult } from "../types";

type RecognitionRequest = {
  fileName?: string;
  demoSpeciesId?: string;
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export const identifySpecies = async ({
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
    status: "unconfirmed",
    mode: "demo",
    analyzedAt: new Date().toISOString(),
    message:
      "No se pudo confirmar la especie. En este prototipo no hay un modelo de IA conectado; sube un archivo con el nombre de una especie demo o elige una especie de prueba.",
  };
};
