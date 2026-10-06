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

const storageV3 = await loadModule("src/services/localStorageV3Service.ts");

const DATASET_ID = "86b75a92-9048-4f2f-a6a8-d38dcf134e92";
const FIXED_NOW = new Date("2026-09-28T18:00:00.000Z");

const representativeState = {
  discoveries: [
    {
      id: "observation-native",
      speciesId: "perro-domestico",
      variantId: "golden",
      discoveredAt: "2026-09-25T12:00:00.000Z",
      identificationMethod: "demo-manual",
      notes: "Plaza del barrio",
      photoRef: "filesystem:observation-photos/observation-native.jpg",
    },
    {
      id: "observation-web",
      speciesId: "hornero",
      discoveredAt: "2026-09-26T15:30:00.000Z",
      identificationMethod: "demo-filename",
      photoRef: "indexeddb:observation-web",
    },
  ],
  xp: 525,
  awardedCategoryBonuses: ["Mamíferos", "Aves"],
  claimedChallengeIds: ["fixed-first-species", "fixed-five-dog-breeds"],
  earnedBadgeIds: ["primer-descubrimiento", "cinco-razas-perro"],
  badgeAwards: [
    { badgeId: "primer-descubrimiento", challengeId: "fixed-first-species", earnedAt: "2026-09-25T12:00:00.000Z" },
    { badgeId: "cinco-razas-perro", challengeId: "fixed-five-dog-breeds", earnedAt: "2026-09-27T10:00:00.000Z" },
  ],
};

const representativeProfile = {
  userId: undefined,
  displayName: "Martina Exploradora",
  username: "martina",
  bio: "Registro fauna urbana.",
  avatarConfig: {
    appearance: "round",
    skinTone: "medium",
    hairStyle: "curly",
    hairColor: "copper",
    outfit: "ranger",
    accessory: "camera",
    background: "river",
  },
  favoriteSpeciesId: "hornero",
  featuredBadgeIds: ["primer-descubrimiento", "cinco-razas-perro"],
  createdAt: "2026-09-20T10:00:00.000Z",
  updatedAt: "2026-09-27T10:00:00.000Z",
};

class MemoryStorage {
  values;
  removed = [];
  writes = [];
  failOnceForPrefix;

  constructor(entries = [], failOnceForPrefix) {
    this.values = new Map(entries);
    this.failOnceForPrefix = failOnceForPrefix;
  }

  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    if (this.failOnceForPrefix && key.startsWith(this.failOnceForPrefix)) {
      this.failOnceForPrefix = undefined;
      throw new Error("interrupted write");
    }
    this.writes.push([key, value]);
    this.values.set(key, value);
  }
  removeItem(key) {
    this.removed.push(key);
    this.values.delete(key);
  }
}

const legacyStorage = (failOnceForPrefix) => {
  const stateRaw = JSON.stringify(representativeState);
  const profileRaw = JSON.stringify(representativeProfile);
  return {
    stateRaw,
    profileRaw,
    storage: new MemoryStorage([
      ["wildex-explorer-state-v2", stateRaw],
      ["wildex-explorer-profile-v1", profileRaw],
      ["unrelated-photo-marker", "must-stay"],
    ], failOnceForPrefix),
  };
};

test("v2 a v3 conserva respaldo, progreso, perfil y referencias fotográficas", () => {
  const { storage, stateRaw, profileRaw } = legacyStorage();
  const context = storageV3.initializeLocalStorageV3({ storage, createUuid: () => DATASET_ID, now: FIXED_NOW });

  assert.equal(context.migrationComplete, true);
  assert.equal(context.datasetId, DATASET_ID);
  assert.equal(context.anonymousNamespace, `anonymous:${DATASET_ID}`);
  assert.equal(storage.getItem("wildex-explorer-state-v2"), stateRaw);
  assert.equal(storage.getItem("wildex-explorer-profile-v1"), profileRaw);
  const stateDocument = JSON.parse(storage.getItem(`wildex-explorer-state-v3:${context.anonymousNamespace}`));
  const profileDocument = JSON.parse(storage.getItem(`wildex-explorer-profile-v3:${context.anonymousNamespace}`));
  const migration = JSON.parse(storage.getItem("wildex-storage-v3-migration-v2"));
  assert.deepEqual(
    { schemaVersion: stateDocument.schemaVersion, namespace: stateDocument.namespace, kind: stateDocument.kind },
    { schemaVersion: 3, namespace: context.anonymousNamespace, kind: "explorer-state" },
  );
  assert.deepEqual(
    { schemaVersion: profileDocument.schemaVersion, namespace: profileDocument.namespace, kind: profileDocument.kind },
    { schemaVersion: 3, namespace: context.anonymousNamespace, kind: "explorer-profile" },
  );
  assert.deepEqual(
    { schemaVersion: migration.schemaVersion, datasetId: migration.datasetId, namespace: migration.namespace, status: migration.status },
    { schemaVersion: 3, datasetId: DATASET_ID, namespace: context.anonymousNamespace, status: "complete" },
  );
  assert.deepEqual(storageV3.loadExplorerStateV3(context.anonymousNamespace, storage), representativeState);
  assert.deepEqual(storageV3.loadExplorerProfileV3(context.anonymousNamespace, storage), representativeProfile);
  assert.deepEqual(
    storageV3.loadExplorerStateV3(context.anonymousNamespace, storage).discoveries.map((item) => item.photoRef),
    ["filesystem:observation-photos/observation-native.jpg", "indexeddb:observation-web"],
  );
  assert.equal(storage.getItem("unrelated-photo-marker"), "must-stay");
  assert.deepEqual(storage.removed, []);
});

test("la migración v3 es idempotente y el segundo arranque no reescribe documentos", () => {
  const { storage } = legacyStorage();
  const first = storageV3.initializeLocalStorageV3({ storage, createUuid: () => DATASET_ID, now: FIXED_NOW });
  const firstSnapshot = new Map(storage.values);
  const firstWriteCount = storage.writes.length;
  const second = storageV3.initializeLocalStorageV3({
    storage,
    createUuid: () => "11111111-1111-4111-8111-111111111111",
    now: new Date("2026-09-29T18:00:00.000Z"),
  });

  assert.deepEqual(second, first);
  assert.deepEqual(storage.values, firstSnapshot);
  assert.equal(storage.writes.length, firstWriteCount);
  assert.equal(storageV3.loadExplorerStateV3(second.anonymousNamespace, storage).discoveries.length, 2);
});

test("una migración interrumpida se recupera sin tocar v2 ni duplicar observaciones", () => {
  const { storage, stateRaw, profileRaw } = legacyStorage(storageV3.STORAGE_V3_PROFILE_PREFIX);
  const interrupted = storageV3.initializeLocalStorageV3({ storage, createUuid: () => DATASET_ID, now: FIXED_NOW });
  assert.equal(interrupted.migrationComplete, false);
  assert.equal(storage.getItem("wildex-explorer-state-v2"), stateRaw);
  assert.equal(storage.getItem("wildex-explorer-profile-v1"), profileRaw);

  const recovered = storageV3.initializeLocalStorageV3({ storage, createUuid: () => DATASET_ID, now: FIXED_NOW });
  assert.equal(recovered.migrationComplete, true);
  assert.equal(storageV3.loadExplorerStateV3(recovered.anonymousNamespace, storage).discoveries.length, 2);
  assert.deepEqual(storageV3.loadExplorerStateV3(recovered.anonymousNamespace, storage), representativeState);
  assert.deepEqual(storage.removed, []);
});

test("login, logout y cambio de cuenta mantienen namespaces independientes", () => {
  const { storage } = legacyStorage();
  const context = storageV3.initializeLocalStorageV3({ storage, createUuid: () => DATASET_ID, now: FIXED_NOW });
  const accountA = storageV3.namespaceForAccount("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  const accountB = storageV3.namespaceForAccount("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  storageV3.ensureStorageV3Namespace(accountA, storage, FIXED_NOW);
  storageV3.ensureStorageV3Namespace(accountB, storage, FIXED_NOW);

  assert.equal(storageV3.loadExplorerStateV3(accountA, storage).xp, 0);
  assert.equal(storageV3.loadExplorerStateV3(accountB, storage).discoveries.length, 0);
  assert.equal(storageV3.loadExplorerStateV3(context.anonymousNamespace, storage).xp, 525);

  const stateA = { ...representativeState, xp: 70, discoveries: [representativeState.discoveries[0]] };
  const stateB = { ...representativeState, xp: 20, discoveries: [representativeState.discoveries[1]], claimedChallengeIds: [] };
  assert.equal(storageV3.saveExplorerStateV3(accountA, stateA, storage, FIXED_NOW), true);
  assert.equal(storageV3.saveExplorerStateV3(accountB, stateB, storage, FIXED_NOW), true);
  const profileA = { ...representativeProfile, displayName: "Cuenta A", username: "cuenta_a" };
  const profileB = { ...representativeProfile, displayName: "Cuenta B", username: "cuenta_b", bio: "Otro dispositivo." };
  assert.equal(storageV3.saveExplorerProfileV3(accountA, profileA, storage, FIXED_NOW), true);
  assert.equal(storageV3.saveExplorerProfileV3(accountB, profileB, storage, FIXED_NOW), true);

  assert.deepEqual(storageV3.loadExplorerStateV3(accountA, storage), stateA);
  assert.deepEqual(storageV3.loadExplorerStateV3(accountB, storage), stateB);
  assert.deepEqual(storageV3.loadExplorerProfileV3(accountA, storage), profileA);
  assert.deepEqual(storageV3.loadExplorerProfileV3(accountB, storage), profileB);
  assert.deepEqual(storageV3.loadExplorerStateV3(context.anonymousNamespace, storage), representativeState);
  assert.deepEqual(storageV3.loadExplorerProfileV3(context.anonymousNamespace, storage), representativeProfile);
  assert.equal(storageV3.hasAnonymousProgressV3(context, storage), true);
  assert.deepEqual(storage.removed, []);
});
