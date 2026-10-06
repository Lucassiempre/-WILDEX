import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { resolve } from "node:path";

async function loadModule(path) {
  const output = await build({ entryPoints: [resolve(path)], bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent" });
  const module = { exports: {} };
  new Function("module", "exports", output.outputFiles[0].text)(module, module.exports);
  return module.exports;
}

const sync = await loadModule("src/services/initialSyncService.ts");
const manifestTools = await loadModule("src/services/initialSyncManifest.ts");
const checkpoints = await loadModule("src/services/initialSyncCheckpointService.ts");
const storageV3 = await loadModule("src/services/localStorageV3Service.ts");
const discoveryService = await loadModule("src/services/discoveryService.ts");
const photoSync = await loadModule("src/services/photoSyncService.ts");

class MemoryStorage {
  values = new Map();
  rejectConfirmed = false;
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    if (this.rejectConfirmed && value.includes('"status":"confirmed"')) throw new Error("storage unavailable");
    this.values.set(key, value);
  }
}

const ids = {
  dataset: "10000000-0000-4000-8000-000000000001",
  dataset2: "10000000-0000-4000-8000-000000000002",
  userA: "20000000-0000-4000-8000-000000000001",
  userB: "20000000-0000-4000-8000-000000000002",
  observationA: "30000000-0000-4000-8000-000000000001",
  observationB: "30000000-0000-4000-8000-000000000002",
};

const avatar = { appearance: "classic", skinTone: "medium", hairStyle: "short", hairColor: "brown", outfit: "explorer", accessory: "none", background: "forest" };
const profile = (overrides = {}) => ({
  displayName: "Martina",
  username: "martina",
  bio: "Exploradora urbana",
  avatarConfig: avatar,
  favoriteSpeciesId: "perro-domestico",
  featuredBadgeIds: [],
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-02T10:00:00.000Z",
  ...overrides,
});
const discovery = (overrides = {}) => ({
  id: ids.observationA,
  speciesId: "perro-domestico",
  variantId: "golden-retriever",
  discoveredAt: "2026-09-01T12:00:00.000Z",
  identificationMethod: "demo-manual",
  confidence: undefined,
  notes: "En la plaza",
  photoRef: "filesystem:observations/photo-a.jpg",
  ...overrides,
});
const state = (overrides = {}) => ({
  discoveries: [discovery()],
  xp: 99999,
  awardedCategoryBonuses: ["Mamíferos"],
  claimedChallengeIds: [],
  earnedBadgeIds: [],
  badgeAwards: [],
  ...overrides,
});

class FakeSyncServer {
  calls = [];
  imports = new Map();
  observations = new Map();
  claims = new Map();
  badges = new Map();
  profile = null;
  featuredBadgeIds = [];
  failSyncAt = 0;
  syncCalls = 0;
  rejectCompletion = false;
  delayBegin = false;

  constructor(userId = ids.userA) { this.userId = userId; }

  rpc = async (name, args = {}) => {
    this.calls.push({ name, args: structuredClone(args) });
    if (name === "attach_observation_photo" || name.startsWith("storage")) throw new Error("photo operation forbidden");
    if (name === "begin_sync_import") {
      if (this.delayBegin) await new Promise((done) => setTimeout(done, 15));
      const key = `${args.p_dataset_id}:${args.p_manifest_sha256}`;
      let item = this.imports.get(key);
      if (!item) {
        item = { id: `40000000-0000-4000-8000-${String(this.imports.size + 1).padStart(12, "0")}`, expected: args.p_expected_observation_count, expectedClaims: args.p_expected_challenge_claim_count, links: new Set(), claimLinks: new Set(), profileSynced: false, status: "pending" };
        this.imports.set(key, item);
      }
      return { data: item, error: null };
    }
    if (name === "sync_observation") {
      this.syncCalls += 1;
      if (this.failSyncAt === this.syncCalls) return { data: null, error: { message: "network unavailable" } };
      const existing = this.observations.get(args.p_observation_id);
      const stable = existing
        && existing.species_id === args.p_species_id
        && (existing.variant_id ?? null) === (args.p_variant_id ?? null)
        && existing.observed_at === args.p_observed_at
        && existing.identification_method === args.p_identification_method;
      if (existing && !stable) return { data: null, error: { message: "observation_identity_conflict" } };
      const editableChanged = existing && (existing.notes ?? null) !== (args.p_notes ?? null);
      if (editableChanged && args.p_expected_revision == null) return { data: null, error: { message: "observation_revision_conflict" } };
      if (editableChanged && args.p_expected_revision !== existing.sync_revision) return { data: null, error: { message: "observation_revision_conflict" } };
      const row = existing ?? { id: args.p_observation_id, sync_revision: 1, created_at: args.p_observed_at };
      Object.assign(row, {
        user_id: this.userId,
        species_id: args.p_species_id,
        variant_id: args.p_variant_id,
        observed_at: args.p_observed_at,
        identification_method: args.p_identification_method,
        species_confidence: args.p_species_confidence,
        notes: args.p_notes,
        custom_name: args.p_custom_name,
        updated_at: args.p_client_updated_at,
      });
      if (editableChanged) row.sync_revision += 1;
      this.observations.set(row.id, row);
      [...this.imports.values()].find((item) => item.id === args.p_import_id)?.links.add(row.id);
      return { data: row, error: null };
    }
    if (name === "claim_challenge") {
      const claim = this.claims.get(args.p_challenge_id) ?? { challenge_id: args.p_challenge_id, claimed_at: args.p_client_claimed_at ?? "2026-09-03T00:00:00.000Z", xp_event_id: crypto.randomUUID() };
      this.claims.set(args.p_challenge_id, claim);
      [...this.imports.values()].find((item) => item.id === args.p_import_id)?.claimLinks.add(args.p_challenge_id);
      return { data: { claimed: true, alreadyClaimed: false }, error: null };
    }
    if (name === "sync_profile") {
      this.profile = {
        id: this.userId,
        username: args.p_username,
        display_name: args.p_display_name,
        bio: args.p_bio,
        avatar_config: args.p_avatar_config,
        favorite_species_id: args.p_favorite_species_id,
        client_updated_at: args.p_client_updated_at,
        sync_revision: (this.profile?.sync_revision ?? 0) + 1,
        created_at: this.profile?.created_at ?? "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-04T00:00:00.000Z",
      };
      this.featuredBadgeIds = [...args.p_featured_badge_ids];
      [...this.imports.values()].find((item) => item.id === args.p_import_id).profileSynced = true;
      return { data: { profile: this.profile, featuredBadgeIds: this.featuredBadgeIds }, error: null };
    }
    if (name === "complete_sync_import") {
      const item = [...this.imports.values()].find((entry) => entry.id === args.p_import_id);
      if (this.rejectCompletion || item.links.size !== item.expected || item.claimLinks.size !== item.expectedClaims || !item.profileSynced) return { data: null, error: { message: "sync_import_incomplete" } };
      item.status = "completed";
      return { data: item, error: null };
    }
    if (name === "get_account_snapshot") return { data: this.snapshot(), error: null };
    return { data: null, error: { message: `unexpected_rpc:${name}` } };
  };

  snapshot() {
    return {
      schemaVersion: 1,
      profile: this.profile ?? { id: this.userId, username: null, display_name: null, bio: null, avatar_config: {}, favorite_species_id: null, sync_revision: 1 },
      featuredBadgeIds: this.featuredBadgeIds,
      observations: [...this.observations.values()],
      speciesDiscoveries: [...new Set([...this.observations.values()].map((item) => item.species_id))],
      variantDiscoveries: [],
      xpEvents: [...new Set([...this.observations.values()].map((item) => item.species_id))].map((speciesId) => ({ event_type: "species-discovery", amount: 50, metadata: {}, speciesId })),
      xpTotal: new Set([...this.observations.values()].map((item) => item.species_id)).size * 50,
      challengeClaims: [...this.claims.values()],
      badges: [...this.badges.values()],
      imports: [...this.imports.values()].map((item) => ({ id: item.id, status: item.status })),
    };
  }
}

const run = (server, options = {}) => {
  const storage = options.storage ?? new MemoryStorage();
  let persisted;
  return {
    storage,
    get persisted() { return persisted; },
    promise: sync.linkAnonymousProgress({
      userId: options.userId ?? server.userId,
      datasetId: options.datasetId ?? ids.dataset,
      anonymousState: options.state ?? state(),
      anonymousProfile: options.profile ?? profile(),
      profileResolution: options.profileResolution,
      storage,
      rpc: server.rpc,
      persistAccountSnapshot: (_userId, accountState, accountProfile) => { persisted = { state: accountState, profile: accountProfile }; },
      now: () => new Date("2026-10-05T12:00:00.000Z"),
    }),
  };
};

test("1. importación normal completa el batch", async () => {
  const server = new FakeSyncServer();
  const task = run(server);
  const result = await task.promise;
  assert.equal(result.kind, "complete");
  assert.equal(result.checkpoint.status, "complete");
});

test("2. un UUID local válido se conserva", async () => {
  const result = await run(new FakeSyncServer()).promise;
  assert.equal(result.checkpoint.observations[0].remoteId, ids.observationA);
});

test("3. un ID legacy produce UUIDv5 determinístico", async () => {
  const source = state({ discoveries: [discovery({ id: "legacy-perro-1" })] });
  const first = await run(new FakeSyncServer(), { state: source }).promise;
  const expected = await manifestTools.deterministicLegacyObservationId({ userId: ids.userA, datasetId: ids.dataset, legacyId: "legacy-perro-1" });
  assert.equal(first.checkpoint.legacyMap["legacy-perro-1"], expected);
});

test("4. retry legacy reutiliza el mapa persistido", async () => {
  const server = new FakeSyncServer();
  const storage = new MemoryStorage();
  const source = state({ discoveries: [discovery({ id: "legacy-perro-2" })] });
  const first = await run(server, { storage, state: source }).promise;
  const second = await run(server, { storage, state: source }).promise;
  assert.deepEqual(second.checkpoint.legacyMap, first.checkpoint.legacyMap);
});

test("5. doble toque comparte una sola ejecución remota", async () => {
  const server = new FakeSyncServer();
  server.delayBegin = true;
  const storage = new MemoryStorage();
  const first = run(server, { storage }).promise;
  const second = run(server, { storage }).promise;
  await Promise.all([first, second]);
  assert.equal(server.calls.filter((call) => call.name === "begin_sync_import").length, 1);
});

test("6. una interrupción conserva observaciones confirmadas", async () => {
  const server = new FakeSyncServer();
  server.failSyncAt = 2;
  const storage = new MemoryStorage();
  const source = state({ discoveries: [discovery(), discovery({ id: ids.observationB, speciesId: "gato-domestico", variantId: null })] });
  const result = await run(server, { storage, state: source }).promise;
  assert.equal(result.kind, "failed");
  assert.equal(result.checkpoint.observations[0].status, "confirmed");
  assert.equal(result.checkpoint.observations[1].status, "pending");
});

test("7. recuperación continúa desde pendientes", async () => {
  const server = new FakeSyncServer();
  server.failSyncAt = 2;
  const storage = new MemoryStorage();
  const source = state({ discoveries: [discovery(), discovery({ id: ids.observationB, speciesId: "gato-domestico", variantId: null })] });
  await run(server, { storage, state: source }).promise;
  server.failSyncAt = 0;
  const result = await run(server, { storage, state: source }).promise;
  assert.equal(result.kind, "complete");
  assert.equal(server.calls.filter((call) => call.name === "sync_observation" && call.args.p_observation_id === ids.observationA).length, 1);
});

test("8. fallo de red deja checkpoint reanudable", async () => {
  const server = new FakeSyncServer();
  server.failSyncAt = 1;
  const result = await run(server).promise;
  assert.equal(result.checkpoint.status, "failed");
  assert.match(result.message, /network/);
});

test("9. respuesta exitosa sin checkpoint se recupera por idempotencia", async () => {
  const server = new FakeSyncServer();
  const storage = new MemoryStorage();
  storage.rejectConfirmed = true;
  const first = await run(server, { storage }).promise;
  assert.equal(first.kind, "failed");
  storage.rejectConfirmed = false;
  const second = await run(server, { storage }).promise;
  assert.equal(second.kind, "complete");
  assert.equal(server.observations.size, 1);
});

test("10. observación remota existente con misma identidad se reutiliza", async () => {
  const server = new FakeSyncServer();
  server.observations.set(ids.observationA, { id: ids.observationA, user_id: ids.userA, species_id: "perro-domestico", variant_id: "golden-retriever", observed_at: "2026-09-01T12:00:00.000Z", identification_method: "demo-manual", notes: "En la plaza", sync_revision: 4 });
  const result = await run(server).promise;
  assert.equal(result.kind, "complete");
  assert.equal(server.observations.size, 1);
});

test("11. la misma observación puede participar en un manifest posterior", async () => {
  const server = new FakeSyncServer();
  await run(server).promise;
  const later = state({ discoveries: [discovery({ notes: "Nota corregida" })] });
  const result = await run(server, { storage: new MemoryStorage(), state: later }).promise;
  assert.equal(result.kind, "complete");
  assert.equal(server.observations.get(ids.observationA).notes, "Nota corregida");
  assert.equal(server.imports.size, 2);
});

test("12. mismo dataset puede importarse en cuenta A", async () => {
  const result = await run(new FakeSyncServer(ids.userA), { userId: ids.userA }).promise;
  assert.equal(result.kind, "complete");
  assert.equal(result.checkpoint.userId, ids.userA);
});

test("13. mismo dataset puede importarse en cuenta B", async () => {
  const result = await run(new FakeSyncServer(ids.userB), { userId: ids.userB }).promise;
  assert.equal(result.kind, "complete");
  assert.equal(result.checkpoint.userId, ids.userB);
});

test("14. checkpoints y UUID legacy quedan aislados entre A y B", async () => {
  const storage = new MemoryStorage();
  const source = state({ discoveries: [discovery({ id: "legacy-shared" })] });
  const a = await run(new FakeSyncServer(ids.userA), { storage, userId: ids.userA, state: source }).promise;
  const b = await run(new FakeSyncServer(ids.userB), { storage, userId: ids.userB, state: source }).promise;
  assert.notEqual(a.checkpoint.observations[0].remoteId, b.checkpoint.observations[0].remoteId);
  assert.notEqual(checkpoints.checkpointKey(ids.dataset, ids.userA, a.checkpoint.manifestHash), checkpoints.checkpointKey(ids.dataset, ids.userB, b.checkpoint.manifestHash));
});

test("15. identidad biológica incompatible se registra como conflicto", async () => {
  const server = new FakeSyncServer();
  server.observations.set(ids.observationA, { id: ids.observationA, species_id: "gato-domestico", variant_id: null, observed_at: "2026-09-01T12:00:00.000Z", identification_method: "demo-manual", sync_revision: 1 });
  const result = await run(server).promise;
  assert.equal(result.kind, "observation-conflict");
  assert.equal(result.checkpoint.observations[0].status, "conflict");
});

test("16. perfil remoto diferente pausa sólo la reconciliación del perfil", async () => {
  const server = new FakeSyncServer();
  server.profile = { username: "remoto", display_name: "Perfil remoto", bio: null, avatar_config: avatar, favorite_species_id: null, client_updated_at: null, sync_revision: 3 };
  const result = await run(server).promise;
  assert.equal(result.kind, "profile-conflict");
  assert.equal(server.observations.size, 1);
});

test("17. decisión explícita permite conservar perfil remoto", async () => {
  const server = new FakeSyncServer();
  server.profile = { username: "remoto", display_name: "Perfil remoto", bio: null, avatar_config: avatar, favorite_species_id: null, client_updated_at: null, sync_revision: 3 };
  const storage = new MemoryStorage();
  await run(server, { storage }).promise;
  const result = await run(server, { storage, profileResolution: "remote" }).promise;
  assert.equal(result.kind, "complete");
  assert.equal(server.profile.username, "remoto");
});

test("18. XP local incorrecto no controla el XP remoto", async () => {
  const server = new FakeSyncServer();
  const task = run(server, { state: state({ xp: 99999 }) });
  const result = await task.promise;
  assert.equal(result.state.xp, 50);
  assert.equal(server.calls.some((call) => call.name === "sync_observation" && Object.keys(call.args).some((key) => /(?:^|_)xp(?:_|$)|amount/i.test(key))), false);
});

test("19. discoveries se reconstruyen desde observaciones del snapshot", async () => {
  const task = run(new FakeSyncServer());
  const result = await task.promise;
  assert.equal(result.state.discoveries[0].speciesId, "perro-domestico");
  assert.equal(result.state.discoveries[0].id, ids.observationA);
});

test("20. challenges se reclaman sólo mediante RPC server-side", async () => {
  const server = new FakeSyncServer();
  const source = state({ claimedChallengeIds: ["fixed-first-species"] });
  const result = await run(server, { state: source }).promise;
  assert.equal(result.kind, "complete");
  const call = server.calls.find((item) => item.name === "claim_challenge");
  assert.equal(call.args.p_challenge_id, "fixed-first-species");
  assert.equal(Object.keys(call.args).some((key) => /xp|amount/i.test(key)), false);
});

test("21. complete_sync_import incompleto no marca éxito local", async () => {
  const server = new FakeSyncServer();
  server.rejectCompletion = true;
  const result = await run(server).promise;
  assert.equal(result.kind, "failed");
  assert.notEqual(result.checkpoint.status, "complete");
});

test("22. complete_sync_import exitoso queda persistido", async () => {
  const server = new FakeSyncServer();
  const storage = new MemoryStorage();
  const result = await run(server, { storage }).promise;
  const stored = checkpoints.loadInitialSyncCheckpoint(ids.dataset, ids.userA, result.checkpoint.manifestHash, storage);
  assert.equal(stored.status, "complete");
});

test("23. snapshot reconstruye el namespace de cuenta mediante callback", async () => {
  const task = run(new FakeSyncServer());
  await task.promise;
  assert.equal(task.persisted.profile.userId, ids.userA);
  assert.equal(task.persisted.state.xp, 50);
});

test("24. namespace anónimo y referencias de fotos permanecen intactos", async () => {
  const source = state();
  const before = structuredClone(source);
  const result = await run(new FakeSyncServer(), { state: source }).promise;
  assert.deepEqual(source, before);
  assert.equal(result.checkpoint.observations[0].photoRef, "filesystem:observations/photo-a.jpg");
});

test("25. importación no adjunta ni sube fotografías", async () => {
  const server = new FakeSyncServer();
  await run(server).promise;
  assert.equal(server.calls.some((call) => call.name === "attach_observation_photo" || call.name.startsWith("storage")), false);
  const begin = server.calls.find((call) => call.name === "begin_sync_import");
  assert.equal(begin.args.p_expected_photo_count, 0);
});

test("manifest es canónico, estable y no contiene timestamps operativos", async () => {
  const input = { datasetId: ids.dataset, state: state(), profile: profile() };
  const first = manifestTools.buildInitialSyncManifest(input);
  const second = manifestTools.buildInitialSyncManifest(structuredClone(input));
  assert.equal(await manifestTools.hashInitialSyncManifest(first), await manifestTools.hashInitialSyncManifest(second));
  assert.equal("generatedAt" in first, false);
});

test("26. capturar, guardar y renderizar conserva la referencia privada", async () => {
  const storage = new MemoryStorage();
  const namespace = storageV3.namespaceForAccount(ids.userA);
  const photoRef = `filesystem:observation-photos/${ids.observationA}.jpg`;
  const dog = { id: "perro-domestico", category: "Mamíferos", variants: [{ id: "golden-retriever" }] };
  const update = discoveryService.createDiscoveryUpdate(state({ discoveries: [], xp: 0, awardedCategoryBonuses: [] }), {
    species: dog,
    variantId: "golden-retriever",
    photoRef,
    photo: "data:image/jpeg;base64,/9j/",
    identificationMethod: "demo-manual",
  }, { id: ids.observationA, discoveredAt: "2026-09-01T12:00:00.000Z" });

  assert.equal(storageV3.saveExplorerStateV3(namespace, update.state, storage), true);
  const reopened = storageV3.loadExplorerStateV3(namespace, storage).discoveries[0];
  const rendered = await photoSync.resolveDiscoveryPhoto(reopened, ids.userA, {
    resolveLocal: async (reference) => reference === photoRef ? "capacitor://local-photo" : undefined,
    remote: { download: async () => { throw new Error("remote should not be used"); } },
    cacheRemote: async () => { throw new Error("remote cache should not be used"); },
  });
  assert.equal(reopened.photoRef, photoRef);
  assert.equal(rendered.src, "capacitor://local-photo");
  assert.equal(rendered.source, "local");
});

test("27. snapshot sin photo_path conserva photoRef local y lo persiste", async () => {
  const task = run(new FakeSyncServer());
  const result = await task.promise;
  assert.equal(result.state.discoveries[0].photoRef, "filesystem:observations/photo-a.jpg");
  assert.equal(task.persisted.state.discoveries[0].photoRef, "filesystem:observations/photo-a.jpg");
  assert.equal(result.state.discoveries[0].remotePhoto, undefined);
});

test("28. snapshot con foto remota conserva y prefiere la referencia local", async () => {
  const server = new FakeSyncServer();
  server.observations.set(ids.observationA, {
    id: ids.observationA,
    user_id: ids.userA,
    species_id: "perro-domestico",
    variant_id: "golden-retriever",
    observed_at: "2026-09-01T12:00:00.000Z",
    identification_method: "demo-manual",
    sync_revision: 1,
    photo_path: `${ids.userA}/${ids.observationA}/photo.jpg`,
    photo_mime_type: "image/jpeg",
    photo_size_bytes: 128,
    photo_sha256: "a".repeat(64),
  });
  const result = await run(server).promise;
  assert.equal(result.state.discoveries[0].photoRef, "filesystem:observations/photo-a.jpg");
  assert.equal(result.state.discoveries[0].remotePhoto.path, `${ids.userA}/${ids.observationA}/photo.jpg`);
  const rendered = await photoSync.resolveDiscoveryPhoto(result.state.discoveries[0], ids.userA, {
    resolveLocal: async () => "capacitor://local-photo",
    remote: { download: async () => { throw new Error("remote should not be used"); } },
    cacheRemote: async () => { throw new Error("remote cache should not be used"); },
  });
  assert.equal(rendered.source, "local");
});

test("29. retry del snapshot conserva la referencia más reciente del namespace de cuenta", async () => {
  const server = new FakeSyncServer();
  const storage = new MemoryStorage();
  await run(server, { storage }).promise;
  const namespace = storageV3.namespaceForAccount(ids.userA);
  const accountState = state({ discoveries: [discovery({ photoRef: "filesystem:observation-photos/account-current.jpg" })] });
  storageV3.saveExplorerStateV3(namespace, accountState, storage);

  const retried = await run(server, { storage }).promise;
  assert.equal(retried.state.discoveries[0].photoRef, "filesystem:observation-photos/account-current.jpg");
  assert.equal(storageV3.loadExplorerStateV3(namespace, storage).discoveries[0].photoRef, "filesystem:observation-photos/account-current.jpg");
});

