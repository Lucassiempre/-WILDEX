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

const catalog = await loadModule("src/data/species.ts");
const game = await loadModule("src/utils/gamification.ts");

test("catalogo: especies, taxones y ambientes consistentes", () => {
  assert.equal(catalog.species.length, 64);
  assert.equal(new Set(catalog.species.map((item) => item.id)).size, catalog.species.length);
  assert.equal(new Set(catalog.species.map((item) => item.scientificName)).size, catalog.species.length);
  assert.ok(catalog.species.every((item) => item.scientificName && item.image && item.sourceUrl && item.explorationTypes.length));
  assert.ok(catalog.species.every((item) => new Set(item.explorationTypes).size === item.explorationTypes.length));
  assert.ok(catalog.species.every((item) => !item.variants || new Set(item.variants.map((variant) => variant.id)).size === item.variants.length));
  assert.ok(catalog.species.find((item) => item.id === "perro-domestico").variants.length >= 8);
  assert.equal(catalog.species.filter((item) => item.scientificName === "Canis familiaris").length, 1);
  assert.equal(catalog.species.filter((item) => item.scientificName === "Felis catus").length, 1);
});

test("progreso, logros y desafios cuentan especies unicas", () => {
  const discoveries = [
    { id: "1", speciesId: "perro-domestico", variantId: "golden", discoveredAt: "2026-09-22T12:00:00Z", identificationMethod: "demo-manual" },
    { id: "2", speciesId: "perro-domestico", variantId: "mestizo", discoveredAt: "2026-09-22T12:01:00Z", identificationMethod: "demo-manual" },
    { id: "3", speciesId: "hornero", discoveredAt: "2026-09-22T12:02:00Z", identificationMethod: "legacy" },
  ];
  const state = { discoveries, xp: 245, awardedCategoryBonuses: ["Mamíferos", "Aves"] };
  assert.equal(game.discoveredSpeciesCount(discoveries), 2);
  assert.equal(game.discoveredVariantCount(discoveries), 2);
  assert.equal(game.categoryCounts(discoveries).Mamíferos, 1);
  assert.equal(game.challengesForState(state).find((item) => item.title === "Tu primera ave").completed, true);
  assert.ok(game.challengesForState(state).every((item) => game.achievementsForState(state).some((achievement) => item.reward === `Logro ${achievement.title}`)));
  assert.equal(game.achievementsForState(state).find((item) => item.title === "Primera variante").unlocked, true);
  assert.equal(game.levelFromXp(245).progress, 98);
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
  assert.equal(storage.saveExplorerState(state), true);
  assert.ok(values.has("wildex-explorer-state-v1"));
  assert.ok(values.has("wildex-explorer-state-v2"));
  globalThis.localStorage = { ...globalThis.localStorage, setItem: () => { throw new Error("quota"); } };
  assert.equal(storage.saveExplorerState(state), false);
  delete globalThis.localStorage;
});
