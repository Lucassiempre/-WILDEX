import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { build } from "esbuild";

async function loadModule(path) {
  const output = await build({ entryPoints: [resolve(path)], bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent" });
  const module = { exports: {} };
  new Function("module", "exports", output.outputFiles[0].text)(module, module.exports);
  return module.exports;
}

const catalog = await loadModule("src/data/species.ts");
const game = await loadModule("src/utils/gamification.ts");
const discoveryService = await loadModule("src/services/discoveryService.ts");
const recognition = await loadModule("src/services/recognitionService.ts");
const album = await loadModule("src/utils/album.ts");
const collections = await loadModule("src/data/thematicCollections.ts");
const collectionUtils = await loadModule("src/utils/thematicCollections.ts");
const challengeData = await loadModule("src/data/challenges.ts");
const challengeService = await loadModule("src/services/challengeService.ts");
const profileService = await loadModule("src/services/profileService.ts");
const avatarData = await loadModule("src/data/avatarOptions.ts");
const nativeCaptureSession = await loadModule("src/services/nativeCaptureSession.ts");

test("captura Android conserva borrador, recupera resultados y distingue cancelaciones", () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const draft = { source: "camera", demoSpeciesId: "hornero", notes: "Plaza", requestedAt: "2026-09-23T12:00:00.000Z", requestId: "capture-1" };
  assert.equal(nativeCaptureSession.saveNativeCaptureDraft(draft), true);
  assert.deepEqual(nativeCaptureSession.loadNativeCaptureDraft(new Date("2026-09-23T12:10:00.000Z")), { ...draft, result: undefined, resultReceivedAt: undefined, lastError: undefined });

  assert.equal(nativeCaptureSession.rememberNativeCaptureResult({ uri: "/data/user/0/app/cache/photo.jpg", webPath: "http://localhost/_capacitor_file_/photo.jpg", thumbnail: "abc" }, new Date("2026-09-23T12:10:01.000Z")), true);
  const withResult = nativeCaptureSession.loadNativeCaptureDraft(new Date("2026-09-23T12:10:02.000Z"));
  assert.equal(withResult.result.uri, "/data/user/0/app/cache/photo.jpg");
  assert.equal(withResult.result.webPath, "http://localhost/_capacitor_file_/photo.jpg");
  assert.equal(withResult.resultReceivedAt, "2026-09-23T12:10:01.000Z");

  const restored = { pluginId: "Camera", methodName: "getPhoto", success: true, data: { path: "/data/user/0/app/cache/photo.jpg", webPath: "http://localhost/_capacitor_file_/photo.jpg", format: "jpeg" } };
  assert.equal(nativeCaptureSession.isCameraRestoredResult(restored), true);
  assert.deepEqual(nativeCaptureSession.restoredMediaResult(restored), restored.data);
  assert.equal(nativeCaptureSession.isCameraRestoredResult({ ...restored, methodName: "takePhoto" }), true);
  assert.deepEqual(nativeCaptureSession.restoredMediaResult({ pluginId: "Camera", methodName: "chooseFromGallery", success: true, data: { results: [{ uri: "content://gallery" }] } }), { uri: "content://gallery" });
  assert.equal(nativeCaptureSession.isCameraRestoredResult({ ...restored, pluginId: "Other" }), false);
  assert.equal(nativeCaptureSession.isNativeCaptureCancellation({ code: "OS-PLUG-CAMR-0006" }), true);
  assert.equal(nativeCaptureSession.isNativeCaptureCancellation({ code: "OS-PLUG-CAMR-0020" }), true);
  assert.equal(nativeCaptureSession.isNativeCaptureCancellation({ message: "User cancelled photos app" }), true);
  assert.equal(nativeCaptureSession.isNativeCaptureCancellation({ code: "OS-PLUG-CAMR-0010", message: "Camera cancelled while processing" }), false);

  assert.equal(nativeCaptureSession.loadNativeCaptureDraft(new Date("2026-09-23T14:00:01.000Z")), undefined);
  assert.equal(values.size, 0);
  delete globalThis.localStorage;
});

test("Android usa cámara URI restaurable, galería moderna e iconos de Wildex", () => {
  const cameraSource = readFileSync(resolve("src/services/nativeCameraService.ts"), "utf8");
  assert.match(cameraSource, /Camera\.getPhoto/);
  assert.match(cameraSource, /CameraResultType\.Uri/);
  assert.match(cameraSource, /CameraSource\.Camera/);
  assert.match(cameraSource, /Camera\.chooseFromGallery/);
  assert.doesNotMatch(cameraSource, /Camera\.takePhoto/);
  assert.ok(cameraSource.indexOf("if (media.webPath)") < cameraSource.indexOf("if (!base64 && uri)"));
  assert.match(cameraSource, /media-read-webpath-failed/);
  assert.match(cameraSource, /media-read-uri-failed/);

  const appSource = readFileSync(resolve("src/App.tsx"), "utf8");
  const discoverSource = readFileSync(resolve("src/pages/DiscoverPage.tsx"), "utf8");
  assert.match(appSource, /result-duplicate-ignored/);
  assert.doesNotMatch(discoverSource, /finally\s*\{\s*clearNativeCaptureDraft/);
  assert.match(readFileSync(resolve("android/app/build.gradle"), "utf8"), /versionCode 6[\s\S]*versionName "1\.0\.0"/);

  const dimensions = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
  for (const [density, expected] of Object.entries(dimensions)) {
    const png = readFileSync(resolve(`android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`));
    assert.equal(png.readUInt32BE(16), expected);
    assert.equal(png.readUInt32BE(20), expected);
    assert.ok(png.length > 2000);
  }
  assert.equal(existsSync(resolve("android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml")), false);
  assert.match(readFileSync(resolve("android/app/src/main/res/values/ic_launcher_background.xml"), "utf8"), /#081610/);
});

test("perfil crea una identidad local con avatar reconstruible", () => {
  const profile = profileService.createDefaultProfile(new Date("2026-09-22T12:00:00Z"));
  assert.equal(profile.displayName, "Martina");
  assert.equal(profile.username, "martina");
  assert.deepEqual(profile.avatarConfig, avatarData.defaultAvatarConfig);
  assert.deepEqual(profile.featuredBadgeIds, []);
  assert.equal(profile.createdAt, "2026-09-22T12:00:00.000Z");
  assert.deepEqual(profileService.normalizeProfile(JSON.parse(JSON.stringify(profile))), profile);
});

test("perfil valida edicion, animal descubierto e insignias destacadas", () => {
  const base = profileService.createDefaultProfile(new Date("2026-09-20T12:00:00Z"));
  const result = profileService.validateProfile({
    ...base,
    displayName: "  Martina Verde  ",
    username: "  martina.ba  ",
    bio: "  Aves y plazas  ",
    favoriteSpeciesId: "hornero",
    featuredBadgeIds: ["observador-aves"],
    avatarConfig: { ...base.avatarConfig, hairStyle: "curly", accessory: "binoculars", background: "river" },
  }, new Set(["hornero"]), new Set(["observador-aves"]), new Date("2026-09-22T15:00:00Z"));
  assert.deepEqual(result.errors, {});
  assert.equal(result.profile.displayName, "Martina Verde");
  assert.equal(result.profile.username, "martina.ba");
  assert.equal(result.profile.favoriteSpeciesId, "hornero");
  assert.deepEqual(result.profile.featuredBadgeIds, ["observador-aves"]);
  assert.equal(result.profile.avatarConfig.accessory, "binoculars");
  assert.equal(result.profile.createdAt, base.createdAt);
  assert.equal(result.profile.updatedAt, "2026-09-22T15:00:00.000Z");

  const invalid = profileService.validateProfile({ ...base, username: "ab", favoriteSpeciesId: "puma", featuredBadgeIds: ["no-obtenida"] }, new Set(["hornero"]), new Set());
  assert.deepEqual(Object.keys(invalid.errors).sort(), ["favoriteSpeciesId", "featuredBadgeIds", "username"]);
});

test("perfil persiste localmente sin modificar el progreso del explorador", () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const profile = { ...profileService.createDefaultProfile(new Date("2026-09-22T12:00:00Z")), displayName: "Luz", favoriteSpeciesId: "carpincho" };
  assert.equal(profileService.saveExplorerProfile(profile), true);
  assert.deepEqual(profileService.loadExplorerProfile(), profile);
  assert.equal(values.has("wildex-explorer-state-v2"), false);
  delete globalThis.localStorage;
});

test("perfil anterior normaliza opciones de avatar desconocidas", () => {
  const normalized = profileService.normalizeProfile({ displayName: "Alex", username: "alex", avatarConfig: { appearance: "desconocida", skinTone: "deep", hairStyle: "long", hairColor: "copper", outfit: "ranger", accessory: "camera", background: "mountain" }, featuredBadgeIds: ["uno", "uno", "dos", "tres", "cuatro"] }, new Date("2026-09-22T12:00:00Z"));
  assert.equal(normalized.avatarConfig.appearance, avatarData.defaultAvatarConfig.appearance);
  assert.equal(normalized.avatarConfig.skinTone, "deep");
  assert.deepEqual(normalized.featuredBadgeIds, ["uno", "dos", "tres"]);
});

test("catalogo: especies, taxones y ambientes consistentes", () => {
  assert.equal(catalog.species.length, 150);
  assert.equal(new Set(catalog.species.map((item) => item.id)).size, catalog.species.length);
  assert.equal(new Set(catalog.species.map((item) => item.scientificName)).size, catalog.species.length);
  assert.ok(catalog.species.every((item) => item.scientificName && item.image && item.sourceUrl && item.explorationTypes.length));
  assert.ok(catalog.species.every((item) => item.description && item.habitat && item.diet && item.distribution && item.whereToFind));
  assert.ok(catalog.species.every((item) => item.sourceUrl.startsWith("https://commons.wikimedia.org/wiki/File:")));
  assert.ok(catalog.species.every((item) => item.image.startsWith("https://commons.wikimedia.org/wiki/Special:FilePath/")));
  assert.equal(new Set(catalog.species.map((item) => item.sourceUrl)).size, catalog.species.length);
  assert.ok(catalog.species.every((item) => new Set(item.explorationTypes).size === item.explorationTypes.length));
  assert.ok(catalog.species.every((item) => !item.variants || new Set(item.variants.map((variant) => variant.id)).size === item.variants.length));
  assert.ok(catalog.species.every((item) => !item.variants || new Set(item.variants.map((variant) => variant.name.toLocaleLowerCase("es"))).size === item.variants.length));
  assert.ok(catalog.species.every((item) => !item.variants || item.variants.every((variant) => variant.description)));
  assert.deepEqual(new Set(catalog.species.map((item) => item.category)), new Set(catalog.categories));
  assert.deepEqual(new Set(catalog.species.flatMap((item) => item.explorationTypes)), new Set(["urban", "wild", "domestic"]));
  const dogVariants = catalog.species.find((item) => item.id === "perro-domestico").variants;
  const catVariants = catalog.species.find((item) => item.id === "gato-domestico").variants;
  assert.equal(dogVariants.filter((item) => item.kind === "raza").length, 50);
  assert.equal(catVariants.filter((item) => item.kind === "raza").length, 30);
  assert.equal(dogVariants.length, 52);
  assert.equal(catVariants.length, 32);
  assert.ok([...dogVariants, ...catVariants].every((item) => item.description));
  assert.equal(catalog.species.filter((item) => item.category === "Aves").length, 59);
  assert.equal(catalog.species.filter((item) => !["perro-domestico", "gato-domestico"].includes(item.id)).reduce((total, item) => total + (item.variants?.length ?? 0), 0), 20);
  assert.equal(catalog.species.filter((item) => item.scientificName === "Canis familiaris").length, 1);
  assert.equal(catalog.species.filter((item) => item.scientificName === "Felis catus").length, 1);
  assert.ok(catalog.categories.every((category) => catalog.species.some((item) => item.category === category)));
});

test("colecciones tematicas: miembros validos, pertenencia multiple y progreso", () => {
  assert.equal(collections.thematicCollections.length, 14);
  assert.equal(new Set(collections.thematicCollections.map((item) => item.id)).size, collections.thematicCollections.length);
  assert.ok(collections.thematicCollections.every((item) => item.speciesIds.length > 0));
  assert.ok(collections.thematicCollections.every((item) => item.speciesIds.every((id) => catalog.getSpeciesById(id))));
  assert.ok(collections.thematicCollections.filter((item) => item.speciesIds.includes("yaguarete")).length >= 2);

  const discoveries = [
    { id: "dog-1", speciesId: "perro-domestico", variantId: "golden", discoveredAt: "2026-09-22T12:00:00Z", identificationMethod: "demo-manual" },
    { id: "dog-2", speciesId: "perro-domestico", variantId: "golden", discoveredAt: "2026-09-22T12:01:00Z", identificationMethod: "demo-manual" },
    { id: "cat-1", speciesId: "gato-domestico", variantId: "siames", discoveredAt: "2026-09-22T12:02:00Z", identificationMethod: "demo-manual" },
    { id: "lion", speciesId: "leon", discoveredAt: "2026-09-22T12:03:00Z", identificationMethod: "demo-manual" },
    { id: "tiger", speciesId: "tigre", discoveredAt: "2026-09-22T12:04:00Z", identificationMethod: "demo-manual" },
  ];
  const dogs = collections.thematicCollections.find((item) => item.id === "perros");
  const cats = collections.thematicCollections.find((item) => item.id === "gatos");
  const felines = collections.thematicCollections.find((item) => item.id === "felinos-salvajes");
  assert.deepEqual(collectionUtils.thematicCollectionProgress(dogs, discoveries), { current: 1, total: 52, percentage: 2 });
  assert.deepEqual(collectionUtils.thematicCollectionProgress(cats, discoveries), { current: 1, total: 32, percentage: 3 });
  assert.deepEqual(collectionUtils.thematicCollectionProgress(felines, discoveries), { current: 2, total: 6, percentage: 33 });
});

test("progreso y logros cuentan especies unicas", () => {
  const discoveries = [
    { id: "1", speciesId: "perro-domestico", variantId: "golden", discoveredAt: "2026-09-22T12:00:00Z", identificationMethod: "demo-manual" },
    { id: "2", speciesId: "perro-domestico", variantId: "mestizo", discoveredAt: "2026-09-22T12:01:00Z", identificationMethod: "demo-manual" },
    { id: "3", speciesId: "hornero", discoveredAt: "2026-09-22T12:02:00Z", identificationMethod: "legacy" },
  ];
  const state = { discoveries, xp: 245, awardedCategoryBonuses: ["Mamíferos", "Aves"], claimedChallengeIds: [], earnedBadgeIds: [] };
  assert.equal(game.discoveredSpeciesCount(discoveries), 2);
  assert.equal(game.discoveredVariantCount(discoveries), 2);
  assert.deepEqual([...game.discoveredVariantIdsForSpecies(discoveries, "perro-domestico")].sort(), ["golden", "mestizo"]);
  assert.equal(game.categoryCounts(discoveries).Mamíferos, 1);
  assert.equal(game.achievementsForState(state).find((item) => item.title === "Primera variante").unlocked, true);
  assert.equal(game.levelFromXp(245).progress, 98);
  assert.equal(game.discoveredSpeciesCount([...discoveries, { id: "old", speciesId: "especie-retirada", discoveredAt: "2020-01-01", identificationMethod: "legacy" }]), 2);
});

test("desafios fijos calculan progreso retroactivo sobre descubrimientos unicos", () => {
  const discoveries = [
    { id: "bird-1", speciesId: "hornero", discoveredAt: "2025-01-01T12:00:00Z", identificationMethod: "legacy" },
    { id: "bird-2", speciesId: "hornero", discoveredAt: "2025-01-02T12:00:00Z", identificationMethod: "legacy" },
    ...["golden", "labrador", "dachshund", "caniche", "border-collie"].map((variantId, index) => ({ id: `dog-${index}`, speciesId: "perro-domestico", variantId, discoveredAt: `2025-01-0${index + 3}T12:00:00Z`, identificationMethod: "legacy" })),
  ];
  const state = { discoveries, xp: 0, awardedCategoryBonuses: [], claimedChallengeIds: [], earnedBadgeIds: [] };
  const evaluated = challengeService.evaluateFixedChallenges(state);
  assert.equal(evaluated.find((item) => item.id === "fixed-first-species").completed, true);
  assert.equal(evaluated.find((item) => item.id === "fixed-first-bird").objectives[0].current, 1);
  assert.equal(evaluated.find((item) => item.id === "fixed-five-dog-breeds").completed, true);
});

test("desafios semanales usan solo observaciones y especies nuevas del periodo", () => {
  const weekly = [{
    id: "weekly-test",
    title: "Prueba semanal",
    description: "Valida todos los objetivos.",
    startDate: "2026-10-05T00:00:00Z",
    endDate: "2026-10-11T23:59:59Z",
    objectives: [
      { id: "observations", type: "observation-count", label: "Observaciones", target: 4 },
      { id: "species", type: "unique-species", label: "Especies", target: 3 },
      { id: "variants", type: "unique-variants", label: "Variantes", target: 2 },
      { id: "birds", type: "category-species", category: "Aves", label: "Aves", target: 2 },
      { id: "urban-birds", type: "collection-species", collectionId: "aves-urbanas", label: "Aves urbanas", target: 2 },
      { id: "new-species", type: "new-species", label: "Especies nuevas", target: 2 },
    ],
    xpReward: 300,
    status: "published",
  }];
  const discoveries = [
    { id: "before", speciesId: "hornero", discoveredAt: "2026-10-04T23:59:59Z", identificationMethod: "legacy" },
    { id: "during-old", speciesId: "hornero", discoveredAt: "2026-10-05T00:00:00Z", identificationMethod: "legacy" },
    { id: "during-new-bird", speciesId: "gorrion", discoveredAt: "2026-10-06T12:00:00Z", identificationMethod: "legacy" },
    { id: "during-dog-1", speciesId: "perro-domestico", variantId: "golden", discoveredAt: "2026-10-07T12:00:00Z", identificationMethod: "legacy" },
    { id: "during-dog-2", speciesId: "perro-domestico", variantId: "labrador", discoveredAt: "2026-10-08T12:00:00Z", identificationMethod: "legacy" },
    { id: "after", speciesId: "paloma-bravia", discoveredAt: "2026-10-12T00:00:00Z", identificationMethod: "legacy" },
  ];
  const state = { discoveries, xp: 0, awardedCategoryBonuses: [], claimedChallengeIds: [], earnedBadgeIds: [] };
  const result = challengeService.evaluateWeeklyChallenges(state, weekly, new Date("2026-10-08T18:00:00Z"))[0];
  assert.equal(result.phase, "active");
  assert.deepEqual(result.objectives.map((item) => item.current), [4, 3, 2, 2, 2, 2]);
  assert.equal(result.completed, true);
});

test("desafios semanales distinguen proximos, activos y finalizados", () => {
  const state = { discoveries: [], xp: 0, awardedCategoryBonuses: [], claimedChallengeIds: [], earnedBadgeIds: [] };
  const definition = [{ id: "dates", title: "Fechas", description: "", startDate: "2026-10-05T00:00:00Z", endDate: "2026-10-11T23:59:59Z", objectives: [{ id: "count", type: "observation-count", label: "Observaciones", target: 1 }], xpReward: 10, status: "published" }];
  assert.equal(challengeService.evaluateWeeklyChallenges(state, definition, new Date("2026-10-04T23:59:59Z"))[0].phase, "upcoming");
  assert.equal(challengeService.evaluateWeeklyChallenges(state, definition, new Date("2026-10-05T00:00:00Z"))[0].phase, "active");
  assert.equal(challengeService.evaluateWeeklyChallenges(state, definition, new Date("2026-10-12T00:00:00Z"))[0].phase, "ended");
});

test("recompensas de desafios se reclaman una sola vez y conservan insignias", () => {
  const state = {
    discoveries: [{ id: "first", speciesId: "hornero", discoveredAt: "2020-01-01T12:00:00Z", identificationMethod: "legacy" }],
    xp: 100,
    awardedCategoryBonuses: [],
    claimedChallengeIds: [],
    earnedBadgeIds: [],
  };
  const first = challengeService.claimChallengeReward(state, "fixed-first-species", [], new Date("2026-09-22T18:00:00Z"));
  assert.equal(first.claimed, true);
  assert.equal(first.xpAwarded, 50);
  assert.equal(first.state.xp, 150);
  assert.deepEqual(first.state.claimedChallengeIds, ["fixed-first-species"]);
  assert.deepEqual(first.state.earnedBadgeIds, ["primer-descubrimiento"]);
  assert.deepEqual(first.state.badgeAwards, [{ badgeId: "primer-descubrimiento", challengeId: "fixed-first-species", earnedAt: "2026-09-22T18:00:00.000Z" }]);
  const repeated = challengeService.claimChallengeReward(first.state, "fixed-first-species");
  assert.equal(repeated.claimed, false);
  assert.equal(repeated.xpAwarded, 0);
  assert.equal(repeated.state.xp, 150);
});

test("descubrimientos otorgan XP una sola vez por especie, categoria y variante", () => {
  const dog = catalog.getSpeciesById("perro-domestico");
  const cat = catalog.getSpeciesById("gato-domestico");
  const hornero = catalog.getSpeciesById("hornero");
  const empty = { discoveries: [], xp: 0, awardedCategoryBonuses: [] };
  const first = discoveryService.createDiscoveryUpdate(empty, { species: dog, variantId: "golden", photo: "data:image/jpeg;base64,abc", notes: "  plaza  ", identificationMethod: "demo-manual" }, { id: "d1", discoveredAt: "2026-09-22T12:00:00Z" });
  assert.equal(first.kind, "species");
  assert.equal(first.xpAwarded, 195);
  assert.equal(first.discovery.notes, "plaza");
  assert.equal(first.state.discoveries.length, 1);

  const repeated = discoveryService.createDiscoveryUpdate(first.state, { species: dog, variantId: "golden", identificationMethod: "demo-manual" }, { id: "d2", discoveredAt: "2026-09-22T12:01:00Z" });
  assert.equal(repeated.kind, "observation");
  assert.equal(repeated.xpAwarded, 0);
  assert.equal(game.discoveredSpeciesCount(repeated.state.discoveries), 1);

  const invalidVariant = discoveryService.createDiscoveryUpdate(repeated.state, { species: dog, variantId: "variante-inventada", identificationMethod: "demo-manual" }, { id: "invalid", discoveredAt: "2026-09-22T12:01:30Z" });
  assert.equal(invalidVariant.kind, "observation");
  assert.equal(invalidVariant.xpAwarded, 0);
  assert.equal(invalidVariant.discovery.variantId, undefined);

  const variant = discoveryService.createDiscoveryUpdate(invalidVariant.state, { species: dog, variantId: "mestizo", identificationMethod: "demo-manual" }, { id: "d3", discoveredAt: "2026-09-22T12:02:00Z" });
  assert.equal(variant.kind, "variant");
  assert.equal(variant.xpAwarded, 20);
  assert.equal(game.discoveredVariantCount(variant.state.discoveries), 2);

  const sameCategory = discoveryService.createDiscoveryUpdate(variant.state, { species: cat, identificationMethod: "demo-manual" }, { id: "d4", discoveredAt: "2026-09-22T12:03:00Z" });
  assert.equal(sameCategory.xpAwarded, 50);
  const newCategory = discoveryService.createDiscoveryUpdate(sameCategory.state, { species: hornero, identificationMethod: "demo-manual" }, { id: "d5", discoveredAt: "2026-09-22T12:04:00Z" });
  assert.equal(newCategory.xpAwarded, 125);
});

test("variantes de aves reutilizan las reglas de XP sin duplicar recompensas", () => {
  const canary = catalog.getSpeciesById("canario-silvestre");
  const empty = { discoveries: [], xp: 0, awardedCategoryBonuses: [] };
  const first = discoveryService.createDiscoveryUpdate(empty, { species: canary, variantId: "amarillo", identificationMethod: "demo-manual" }, { id: "bird-1", discoveredAt: "2026-09-22T13:00:00Z" });
  assert.equal(first.xpAwarded, 195);
  const repeated = discoveryService.createDiscoveryUpdate(first.state, { species: canary, variantId: "amarillo", identificationMethod: "demo-manual" }, { id: "bird-2", discoveredAt: "2026-09-22T13:01:00Z" });
  assert.equal(repeated.xpAwarded, 0);
  const newColor = discoveryService.createDiscoveryUpdate(repeated.state, { species: canary, variantId: "factor-rojo", identificationMethod: "demo-manual" }, { id: "bird-3", discoveredAt: "2026-09-22T13:02:00Z" });
  assert.equal(newColor.xpAwarded, 20);
});

test("album usa solo fotos propias, agrupa especies y conserva progreso al editar", () => {
  const discoveries = [
    { id: "d1", speciesId: "perro-domestico", variantId: "golden", photo: "data:image/jpeg;base64,uno", discoveredAt: "2026-09-20T12:00:00Z", identificationMethod: "demo-manual", notes: "Parque" },
    { id: "d2", speciesId: "perro-domestico", variantId: "mestizo", photo: "data:image/jpeg;base64,dos", discoveredAt: "2026-09-22T12:00:00Z", identificationMethod: "demo-manual" },
    { id: "d3", speciesId: "gato-domestico", discoveredAt: "2026-09-21T12:00:00Z", identificationMethod: "demo-manual" },
    { id: "d4", speciesId: "hornero", photo: "data:image/jpeg;base64,tres", discoveredAt: "2026-09-21T14:00:00Z", identificationMethod: "demo-manual" },
    { id: "d5", speciesId: "carpincho", photoRef: "indexeddb:d5", discoveredAt: "2026-09-23T14:00:00Z", identificationMethod: "demo-manual" },
  ];
  const albums = album.buildSpeciesAlbums(discoveries);
  assert.equal(album.photoDiscoveries(discoveries).length, 4);
  assert.equal(albums.length, 3);
  const dogAlbum = albums.find((item) => item.species.id === "perro-domestico");
  assert.deepEqual(dogAlbum.photos.map((item) => item.id), ["d2", "d1"]);
  assert.deepEqual(album.registeredVariantIds(dogAlbum.photos), ["mestizo", "golden"]);
  assert.equal(album.photographedSpeciesCount(discoveries), 3);

  const state = { discoveries, xp: 215, awardedCategoryBonuses: ["Mamíferos"] };
  const updated = discoveryService.updateDiscoveryDetails(state, "d2", { customName: "  Firulais  ", notes: "  El perro de la plaza  " });
  assert.equal(updated.discoveries.length, discoveries.length);
  assert.equal(updated.xp, state.xp);
  assert.equal(updated.discoveries[1].customName, "Firulais");
  assert.equal(updated.discoveries[1].notes, "El perro de la plaza");
  assert.equal(updated.discoveries[0].notes, "Parque");
});

test("album integra automaticamente especies nuevas del catalogo", () => {
  const discoveries = [
    { id: "zoo-1", speciesId: "leon", photo: "data:image/jpeg;base64,leon", discoveredAt: "2026-09-22T15:00:00Z", identificationMethod: "demo-manual" },
    { id: "aquarium-1", speciesId: "ajolote", photo: "data:image/jpeg;base64,ajolote", discoveredAt: "2026-09-22T16:00:00Z", identificationMethod: "demo-manual" },
  ];
  const albums = album.buildSpeciesAlbums(discoveries);
  assert.deepEqual(albums.map((item) => item.species.id), ["ajolote", "leon"]);
  assert.equal(album.photographedSpeciesCount(discoveries), 2);
});

test("reconocimiento demo respeta seleccion manual y declara coincidencias por nombre", async () => {
  const [manual, filename, unknown] = await Promise.all([
    recognition.identifyDemo({ fileName: "perro.jpg", demoSpeciesId: "gato-domestico" }),
    recognition.identifyDemo({ fileName: "hornero-en-plaza.jpg" }),
    recognition.identifyDemo({ fileName: "foto-sin-pistas.jpg" }),
  ]);
  assert.equal(manual.status, "demo-sample");
  assert.equal(manual.speciesId, "gato-domestico");
  assert.equal(manual.identificationMethod, "demo-manual");
  assert.equal(manual.variantId, undefined);
  assert.equal(manual.speciesConfidence, undefined);
  assert.equal(manual.variantConfidence, undefined);
  assert.equal(filename.status, "demo-match");
  assert.equal(filename.speciesId, "hornero");
  assert.equal(filename.identificationMethod, "demo-filename");
  assert.equal(unknown.status, "unrecognized");
  assert.equal(unknown.speciesId, undefined);
});

test("almacenamiento migra v1 sin borrar la coleccion anterior", async () => {
  const values = new Map([["wildex-explorer-state-v1", JSON.stringify({ discoveries: [{ speciesId: "carpincho", discoveredAt: "2026-09-22T10:00:00Z" }], xp: 175, awardedCategoryBonuses: ["Mamíferos"] })]]);
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const storage = await loadModule("src/services/storageService.ts");
  const state = storage.loadExplorerState();
  assert.equal(state.discoveries[0].id, "legacy-0-carpincho");
  assert.equal(state.discoveries[0].identificationMethod, "legacy");
  assert.equal(state.xp, 175);
  assert.deepEqual(state.claimedChallengeIds, []);
  assert.deepEqual(state.earnedBadgeIds, []);
  assert.deepEqual(state.badgeAwards, []);
  assert.equal(storage.saveExplorerState(state), true);
  assert.ok(values.has("wildex-explorer-state-v1"));
  assert.ok(values.has("wildex-explorer-state-v2"));
  const stateWithMigratedPhoto = {
    ...state,
    discoveries: [{ ...state.discoveries[0], photoRef: "indexeddb:legacy-photo", photo: "blob:http://localhost/resolved" }],
  };
  assert.equal(storage.saveExplorerState(stateWithMigratedPhoto), true);
  const serialized = JSON.parse(values.get("wildex-explorer-state-v2"));
  assert.equal(serialized.discoveries[0].photoRef, "indexeddb:legacy-photo");
  assert.equal(serialized.discoveries[0].photo, undefined);
  globalThis.localStorage = { ...globalThis.localStorage, setItem: () => { throw new Error("quota"); } };
  assert.equal(storage.saveExplorerState(state), false);
  delete globalThis.localStorage;
});

test("almacenamiento conserva desafios reclamados e insignias sin duplicados", async () => {
  const values = new Map([["wildex-explorer-state-v2", JSON.stringify({
    discoveries: [],
    xp: 350,
    awardedCategoryBonuses: [],
    claimedChallengeIds: ["fixed-first-species", "fixed-first-species"],
    earnedBadgeIds: ["primer-descubrimiento", "primer-descubrimiento"],
    badgeAwards: [{ badgeId: "primer-descubrimiento", challengeId: "fixed-first-species", earnedAt: "2026-09-22T18:00:00Z" }],
  })]]);
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const storage = await loadModule("src/services/storageService.ts");
  const state = storage.loadExplorerState();
  assert.deepEqual(state.claimedChallengeIds, ["fixed-first-species"]);
  assert.deepEqual(state.earnedBadgeIds, ["primer-descubrimiento"]);
  assert.equal(state.badgeAwards[0].challengeId, "fixed-first-species");
  assert.equal(storage.saveExplorerState(state), true);
  const saved = JSON.parse(values.get("wildex-explorer-state-v2"));
  assert.deepEqual(saved.claimedChallengeIds, ["fixed-first-species"]);
  assert.deepEqual(saved.earnedBadgeIds, ["primer-descubrimiento"]);
  delete globalThis.localStorage;
});

test("almacenamiento recupera v1 si v2 esta dañado y normaliza datos heredados", async () => {
  const values = new Map([
    ["wildex-explorer-state-v2", "{invalido"],
    ["wildex-explorer-state-v1", JSON.stringify({ discoveries: [
      { id: "repetido", speciesId: "puma", discoveredAt: "fecha-invalida" },
      { id: "repetido", speciesId: "carpincho", discoveredAt: "2026-09-22T10:00:00Z" },
    ], xp: 80, awardedCategoryBonuses: ["Mamíferos", "No existe"] })],
  ]);
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const storage = await loadModule("src/services/storageService.ts");
  const state = storage.loadExplorerState();
  assert.equal(state.discoveries.length, 2);
  assert.equal(new Set(state.discoveries.map((item) => item.id)).size, 2);
  assert.equal(state.discoveries[0].discoveredAt, "1970-01-01T00:00:00.000Z");
  assert.deepEqual(state.awardedCategoryBonuses, ["Mamíferos"]);
  assert.equal(state.xp, 80);
  delete globalThis.localStorage;
});
