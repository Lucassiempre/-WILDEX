import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { build } from "esbuild";

async function loadModule(path) {
  const output = await build({ entryPoints: [resolve(path)], bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent" });
  const module = { exports: {} };
  new Function("module", "exports", output.outputFiles[0].text)(module, module.exports);
  return module.exports;
}

const core = await loadModule("supabase/functions/_shared/animalRecognitionCore.ts");
const imageDataUrl = "data:image/jpeg;base64,YWJj";
const catalog = [
  { id: "perro-domestico", common_name: "Perro doméstico", scientific_name: "Canis lupus familiaris", keywords: ["perro"] },
  { id: "gato-domestico", common_name: "Gato doméstico", scientific_name: "Felis catus", keywords: ["gato"] },
];
const dog = { detectedAnimal: true, commonName: "Perro", scientificName: "Canis lupus familiaris", confidence: "high", reason: "La imagen muestra un perro." };

const dependencies = (overrides = {}) => ({
  verifyToken: async () => ({ userId: "user-a" }),
  listCatalog: async () => ({ data: catalog, error: null }),
  recognize: async () => dog,
  ...overrides,
});

test("Edge Function rechaza usuario no autenticado", async () => {
  const result = await core.executeAnimalRecognitionRequest({ method: "POST", body: { imageDataUrl } }, dependencies());
  assert.equal(result.status, 401);
});

test("resultado válido se mapea contra el catálogo, no contra un ID del modelo", async () => {
  const result = await core.executeAnimalRecognitionRequest({ method: "POST", authorization: "Bearer valid", body: { imageDataUrl, selectedSpeciesId: "perro-domestico" } }, dependencies());
  assert.equal(result.status, 200);
  assert.equal(result.body.result.possibleSpeciesId, "perro-domestico");
  assert.equal(result.body.result.matchesSelectedSpecies, true);
});

test("animal distinto al seleccionado devuelve coincidencia falsa", () => {
  const result = core.normalizeAnimalRecognition(dog, catalog, "gato-domestico");
  assert.equal(result.possibleSpeciesId, "perro-domestico");
  assert.equal(result.matchesSelectedSpecies, false);
});

test("animal fuera del catálogo conserva el nombre pero no recibe speciesId", () => {
  const result = core.normalizeAnimalRecognition({ ...dog, commonName: "Okapi", scientificName: "Okapia johnstoni" }, catalog);
  assert.equal(result.detectedAnimal, true);
  assert.equal(result.commonName, "Okapi");
  assert.equal(result.possibleSpeciesId, null);
});

test("si no se detecta animal nunca se asigna speciesId", () => {
  const result = core.normalizeAnimalRecognition({ detectedAnimal: false, commonName: null, scientificName: null, confidence: "unknown", reason: "No se observa un animal." }, catalog, "perro-domestico");
  assert.equal(result.possibleSpeciesId, null);
  assert.equal(result.matchesSelectedSpecies, null);
});

test("confianza baja no produce coincidencia de catálogo", () => {
  assert.equal(core.normalizeAnimalRecognition({ ...dog, confidence: "low" }, catalog).possibleSpeciesId, null);
});

test("respuesta inválida del proveedor se rechaza", () => {
  assert.throws(() => core.sanitizeProviderResult({ detectedAnimal: true, confidence: "certain", reason: "x" }), /invalid_provider_response/);
});

test("error del proveedor se devuelve sin inventar resultado", async () => {
  const result = await core.executeAnimalRecognitionRequest({ method: "POST", authorization: "Bearer valid", body: { imageDataUrl } }, dependencies({ recognize: async () => { throw new core.AnimalRecognitionError("provider_error", 502); } }));
  assert.deepEqual(result, { status: 502, body: { ok: false, error: "provider_error" } });
});

test("GEMINI_API_KEY ausente impide llamar al proveedor", async () => {
  await assert.rejects(core.recognizeWithGemini({ image: core.parseImageDataUrl(imageDataUrl) }), /gemini_not_configured/);
});

test("Gemini recibe imagen, JSON estructurado y nunca un possibleSpeciesId", async () => {
  let requestBody;
  const fetcher = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(dog) }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await core.recognizeWithGemini({ apiKey: "test-only", image: core.parseImageDataUrl(imageDataUrl), fetcher });
  assert.equal(result.commonName, "Perro");
  assert.equal(JSON.stringify(requestBody).includes("possibleSpeciesId"), false);
  assert.equal(requestBody.generationConfig.responseMimeType, "application/json");
});

test("Gemini expone diagnóstico de tiempos, estado y parseo sin incluir la imagen", async () => {
  const events = [];
  const fetcher = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(dog) }] } }] }), { status: 200 });
  await core.recognizeWithGemini({
    apiKey: "test-only",
    model: "test-model",
    image: core.parseImageDataUrl(imageDataUrl),
    fetcher,
    diagnostics: {
      onStart: (details) => events.push(["start", details]),
      onResponse: (details) => events.push(["response", details]),
      onJsonParsed: (details) => events.push(["parsed", details]),
    },
  });
  assert.equal(events[0][0], "start");
  assert.equal(events[0][1].model, "test-model");
  assert.equal(events[1][0], "response");
  assert.equal(events[1][1].status, 200);
  assert.equal(typeof events[1][1].durationMs, "number");
  assert.deepEqual(events[2], ["parsed", { success: true }]);
  assert.equal(JSON.stringify(events).includes("YWJj"), false);
});

test("validación MIME rechaza formatos no permitidos", () => {
  assert.throws(() => core.parseImageDataUrl("data:image/gif;base64,YWJj"), /unsupported_image/);
});

test("validación de tamaño rechaza una imagen mayor a 5 MB", () => {
  const oversized = "A".repeat(Math.ceil((core.MAX_IMAGE_BYTES + 1) * 4 / 3 / 4) * 4);
  assert.throws(() => core.parseImageDataUrl(`data:image/jpeg;base64,${oversized}`), /image_too_large/);
});
