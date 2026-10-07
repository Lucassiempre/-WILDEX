import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

async function loadModule(path) {
  const output = await build({ entryPoints: [resolve(path)], bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent" });
  const module = { exports: {} };
  new Function("module", "exports", output.outputFiles[0].text)(module, module.exports);
  return module.exports;
}

const visual = await loadModule("src/services/visualRecognitionService.ts");
const recognition = await loadModule("src/services/recognitionService.ts");
const catalogSearch = await loadModule("src/services/catalogSearchService.ts");
const speciesCatalog = (await loadModule("src/data/species.ts")).species;
const validResult = {
  detectedAnimal: true,
  commonName: "Perro doméstico",
  scientificName: "Canis lupus familiaris",
  possibleSpeciesId: "perro-domestico",
  confidence: "high",
  matchesSelectedSpecies: true,
  reason: "La imagen muestra un perro doméstico.",
};

const client = ({ session = true, result = validResult, error = null, invoke } = {}) => ({
  auth: { getSession: async () => ({ data: { session: session ? { user: { id: "user-a" } } : null }, error: null }) },
  functions: { invoke: invoke ?? (async () => ({ data: { ok: true, result }, error })) },
});

test("resultado visual válido conserva una especie real del catálogo", async () => {
  const result = await visual.identifyAnimalPhoto({ imageDataUrl: "data:image/jpeg;base64,YWJj", selectedSpeciesId: "perro-domestico", client: client() });
  assert.equal(result.possibleSpeciesId, "perro-domestico");
  assert.equal(result.matchesSelectedSpecies, true);
});

test("sin especie manual la verificación queda bloqueada y no llega a Gemini", async () => {
  assert.equal(recognition.canVerifySelectedSpecies({ hasPhoto: true, selectedSpeciesId: "", busy: false }), false);
  assert.equal(recognition.canVerifySelectedSpecies({ hasPhoto: true, selectedSpeciesId: "leon", busy: false }), true);
  const result = await recognition.identifySpecies({ imageDataUrl: "data:image/jpeg;base64,YWJj" });
  assert.equal(result.status, "unconfirmed");
  assert.equal(result.mode, "demo");
  assert.match(result.message, /Seleccioná una especie/);
});

test("animal diferente a la selección se informa sin cambiar el resultado", async () => {
  const result = await visual.identifyAnimalPhoto({ imageDataUrl: "data:image/jpeg;base64,YWJj", selectedSpeciesId: "gato-domestico", client: client() });
  assert.equal(result.possibleSpeciesId, "perro-domestico");
  assert.equal(result.matchesSelectedSpecies, false);
});

test("foto de león con abeja seleccionada produce mismatch y bloquea guardado", () => {
  const analysis = {
    speciesId: "leon",
    detectedAnimal: true,
    detectedCommonName: "León",
    recognitionConfidence: "high",
    matchesSelectedSpecies: false,
    identificationMethod: "model",
    status: "model-match",
    mode: "model",
    message: "La imagen muestra un león.",
    analyzedAt: "2026-10-07T12:00:00.000Z",
  };
  const status = recognition.nextVerificationStatus({ type: "analysis_received", analysis });
  assert.equal(recognition.confirmedSpeciesIdForAnalysis(analysis, "abeja-melifera"), "abeja-melifera");
  assert.equal(status, "verified_mismatch");
  assert.equal(recognition.canSaveObservation({ hasPhoto: true, selectedSpeciesId: "abeja-melifera", verificationStatus: status }), false);
});

test("selección previa león puede confirmarse cuando la IA detecta león", () => {
  const analysis = {
    speciesId: "leon",
    detectedAnimal: true,
    detectedCommonName: "León",
    recognitionConfidence: "high",
    matchesSelectedSpecies: true,
    identificationMethod: "model",
    status: "model-match",
    mode: "model",
    message: "La imagen muestra un león.",
    analyzedAt: "2026-10-07T12:00:00.000Z",
  };
  assert.equal(recognition.confirmedSpeciesIdForAnalysis(analysis, "leon"), "leon");
  const status = recognition.nextVerificationStatus({ type: "analysis_received", analysis });
  assert.equal(status, "verified_match");
  assert.equal(recognition.canSaveObservation({ hasPhoto: true, selectedSpeciesId: "leon", verificationStatus: status }), true);
});

test("resultado IA sin coincidencia de catálogo no confirma la selección previa", () => {
  const analysis = {
    detectedAnimal: true,
    detectedCommonName: "Okapi",
    recognitionConfidence: "medium",
    matchesSelectedSpecies: null,
    identificationMethod: "model",
    status: "model-no-catalog",
    mode: "model",
    message: "La imagen parece mostrar un okapi.",
    analyzedAt: "2026-10-07T12:00:00.000Z",
  };
  assert.equal(recognition.confirmedSpeciesIdForAnalysis(analysis, "cebra-llanura"), "");
});

test("fallback manual puede conservar la especie elegida sin presentarla como IA", () => {
  const fallback = {
    speciesId: "cebra-llanura",
    identificationMethod: "demo-manual",
    status: "demo-sample",
    mode: "demo",
    message: "Identificación manual.",
    analyzedAt: "2026-10-07T12:00:00.000Z",
  };
  assert.equal(recognition.confirmedSpeciesIdForAnalysis(fallback, "cebra-llanura"), "cebra-llanura");
  const status = recognition.nextVerificationStatus({ type: "analysis_received", analysis: fallback });
  assert.equal(status, "verification_unavailable");
  assert.equal(recognition.canSaveObservation({ hasPhoto: true, selectedSpeciesId: "cebra-llanura", verificationStatus: status }), true);
});

test("abeja seleccionada sin verificación no puede guardarse", () => {
  assert.equal(recognition.canSaveObservation({ hasPhoto: true, selectedSpeciesId: "abeja-melifera", verificationStatus: "not_verified" }), false);
});

test("503 o timeout habilita guardado manual solamente como verification_unavailable", () => {
  const unavailable = { identificationMethod: "demo-manual", status: "connection-error", mode: "demo", message: "No disponible", analyzedAt: "2026-10-07T12:00:00.000Z" };
  const status = recognition.nextVerificationStatus({ type: "analysis_received", analysis: unavailable });
  assert.equal(status, "verification_unavailable");
  assert.equal(recognition.canSaveObservation({ hasPhoto: true, selectedSpeciesId: "abeja-melifera", verificationStatus: status }), true);
  assert.equal(unavailable.identificationMethod, "demo-manual");
});

test("cambiar especie después de match vuelve a not_verified y bloquea", () => {
  const status = recognition.nextVerificationStatus({ type: "species_changed" });
  assert.equal(status, "not_verified");
  assert.equal(recognition.canSaveObservation({ hasPhoto: true, selectedSpeciesId: "abeja-melifera", verificationStatus: status }), false);
});

test("cambiar foto después de match vuelve a not_verified y bloquea", () => {
  const status = recognition.nextVerificationStatus({ type: "photo_changed" });
  assert.equal(status, "not_verified");
  assert.equal(recognition.canSaveObservation({ hasPhoto: true, selectedSpeciesId: "leon", verificationStatus: status }), false);
});

test("Usar León después de mismatch selecciona león, marca match y permite guardar", () => {
  const selectedSpeciesId = "leon";
  const status = recognition.nextVerificationStatus({ type: "detected_species_accepted" });
  assert.equal(status, "verified_match");
  assert.equal(recognition.canSaveObservation({ hasPhoto: true, selectedSpeciesId, verificationStatus: status }), true);
});

test("búsqueda leo devuelve especies relevantes y prioriza nombres comunes", () => {
  const results = catalogSearch.searchSpecies(speciesCatalog, "leo");
  const ids = results.map((item) => item.id);
  assert.equal(ids[0], "leon");
  assert.equal(ids.includes("leopardo"), true);
});

test("búsqueda sin tildes encuentra nombres con tilde", () => {
  assert.equal(catalogSearch.searchSpecies(speciesCatalog, "leon").some((item) => item.commonName === "León"), true);
});

test("especie elegida desde autocomplete conserva variantes y guardado", async () => {
  const dog = catalogSearch.searchSpecies(speciesCatalog, "perro doméstico")[0];
  assert.equal(dog.id, "perro-domestico");
  assert.equal((dog.variants?.length ?? 0) > 0, true);
  const variant = catalogSearch.searchVariants(dog.variants, "labrador")[0];
  assert.equal(Boolean(variant?.id), true);
  assert.equal(recognition.canSaveObservation({ hasPhoto: true, selectedSpeciesId: dog.id, verificationStatus: "verification_unavailable" }), true);
  const discoverSource = await readFile(resolve("src/pages/DiscoverPage.tsx"), "utf8");
  assert.match(discoverSource, /VariantAutocomplete[^]*items=\{confirmedSpecies\.variants\}/);
});

test("speciesId desconocido se descarta en el cliente", async () => {
  const result = await visual.identifyAnimalPhoto({ imageDataUrl: "data:image/jpeg;base64,YWJj", client: client({ result: { ...validResult, possibleSpeciesId: "inventado" } }) });
  assert.equal(result.possibleSpeciesId, null);
});

test("respuesta inválida del backend se rechaza", async () => {
  await assert.rejects(
    visual.identifyAnimalPhoto({ imageDataUrl: "data:image/jpeg;base64,YWJj", client: client({ result: { confidence: "certain" } }) }),
    (error) => error.code === "invalid-response",
  );
});

test("usuario sin sesión no invoca la Edge Function", async () => {
  let invoked = false;
  await assert.rejects(
    visual.identifyAnimalPhoto({ imageDataUrl: "data:image/jpeg;base64,YWJj", client: client({ session: false, invoke: async () => { invoked = true; } }) }),
    (error) => error.code === "not-authenticated",
  );
  assert.equal(invoked, false);
});

test("error de red se convierte en error controlado", async () => {
  await assert.rejects(
    visual.identifyAnimalPhoto({ imageDataUrl: "data:image/jpeg;base64,YWJj", client: client({ error: new Error("network") }) }),
    (error) => error.code === "network",
  );
});

test("timeout cancela la invocación", async () => {
  const slowClient = client({ invoke: (_name, options) => new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ data: { ok: true, result: validResult }, error: null }), 100);
    options.signal.addEventListener("abort", () => { clearTimeout(timer); resolve({ data: null, error: new Error("AbortError") }); });
  }) });
  await assert.rejects(
    visual.identifyAnimalPhoto({ imageDataUrl: "data:image/jpeg;base64,YWJj", timeoutMs: 5, client: slowClient }),
    (error) => error.code === "timeout",
  );
});

test("una respuesta vieja no puede aplicarse después de cambiar la captura", () => {
  const guard = visual.createRecognitionRequestGuard();
  const first = guard.begin("foto-a");
  const second = guard.begin("foto-b");
  assert.equal(first.signal.aborted, true);
  assert.equal(guard.isCurrent(first.token, "foto-a"), false);
  assert.equal(guard.isCurrent(second.token, "foto-b"), true);
  assert.equal(guard.isCurrent(second.token, "foto-c"), false);
});
