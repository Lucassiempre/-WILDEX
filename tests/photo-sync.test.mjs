import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";
import { build } from "esbuild";

async function loadModule(path) {
  const output = await build({ entryPoints: [resolve(path)], bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent" });
  const module = { exports: {} };
  new Function("module", "exports", output.outputFiles[0].text)(module, module.exports);
  return module.exports;
}

const photos = await loadModule("src/services/photoSyncService.ts");

class MemoryStorage {
  values = new Map();
  removed = [];
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.removed.push(key); this.values.delete(key); }
}

const ids = {
  userA: "20000000-0000-4000-8000-000000000001",
  userB: "20000000-0000-4000-8000-000000000002",
  observationA: "30000000-0000-4000-8000-000000000001",
  observationB: "30000000-0000-4000-8000-000000000002",
};
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const jpeg2 = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 8, 9, 10]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

const checkpoint = (items = [{ remoteId: ids.observationA, sourceId: "legacy-a", photoRef: "filesystem:photo-a.jpg" }]) => ({
  schemaVersion: 1,
  datasetId: "10000000-0000-4000-8000-000000000001",
  userId: ids.userA,
  manifestHash: "a".repeat(64),
  manifest: {},
  status: "complete",
  observations: items.map((item) => ({ ...item, legacySourceId: item.sourceId, hasInlinePhoto: false, status: "confirmed" })),
  legacyMap: {}, profile: { status: "confirmed" }, challengeClaims: [], errors: [],
  createdAt: "2026-10-05T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z",
});

class FakeRemote {
  objects = new Map();
  observations = new Map();
  uploads = [];
  attaches = [];
  downloads = [];
  failUpload = false;
  snapshotCalls = 0;
  failSnapshotAt = 0;

  constructor(observationIds = [ids.observationA]) {
    for (const id of observationIds) this.observations.set(id, { id, sync_revision: 1, photo_path: null });
  }

  upload = async (path, bytes, mimeType) => {
    this.uploads.push({ path, mimeType });
    if (this.failUpload) throw new Error("network unavailable");
    if (this.objects.has(path)) throw new Error("The resource already exists");
    this.objects.set(path, Uint8Array.from(bytes));
  };

  download = async (path) => {
    this.downloads.push(path);
    const bytes = this.objects.get(path);
    if (!bytes) throw new Error("Object not found");
    return Uint8Array.from(bytes);
  };

  attach = async (args) => {
    this.attaches.push(structuredClone(args));
    const row = this.observations.get(args.p_observation_id);
    if (!row) throw new Error("observation_not_found");
    if (row.sync_revision !== args.p_expected_revision) throw new Error("observation_revision_conflict");
    Object.assign(row, {
      photo_path: args.p_photo_path,
      photo_mime_type: args.p_photo_mime_type,
      photo_size_bytes: args.p_photo_size_bytes,
      photo_sha256: args.p_photo_sha256,
      sync_revision: row.sync_revision + 1,
    });
    return row;
  };

  snapshot = async () => {
    this.snapshotCalls += 1;
    if (this.failSnapshotAt === this.snapshotCalls) throw new Error("app interrupted");
    return { observations: [...this.observations.values()].map((row) => ({ ...row })) };
  };
}

const run = (remote, options = {}) => photos.syncObservationPhotos({
  userId: options.userId ?? ids.userA,
  checkpoint: options.checkpoint ?? checkpoint(),
  storage: options.storage ?? new MemoryStorage(),
  remote,
  readLocal: options.readLocal ?? (async () => jpeg),
  now: () => new Date("2026-10-05T12:00:00.000Z"),
});

test("1. procesa una referencia filesystem sin modificarla", async () => {
  let reference;
  const result = await run(new FakeRemote(), { readLocal: async (value) => { reference = value; return jpeg; } });
  assert.equal(reference, "filesystem:photo-a.jpg");
  assert.equal(result.completed, 1);
});

test("2. procesa una referencia indexeddb", async () => {
  let reference;
  const result = await run(new FakeRemote(), { checkpoint: checkpoint([{ remoteId: ids.observationA, sourceId: "a", photoRef: "indexeddb:photo-a" }]), readLocal: async (value) => { reference = value; return jpeg; } });
  assert.equal(reference, "indexeddb:photo-a");
  assert.equal(result.completed, 1);
});

test("3. SHA-256 es determinístico", async () => {
  assert.equal(await photos.sha256Photo(jpeg), await photos.sha256Photo(Uint8Array.from(jpeg)));
});

test("4. ruta remota es determinística y compatible con SQL", async () => {
  const hash = await photos.sha256Photo(jpeg);
  assert.equal(photos.deterministicPhotoPath(ids.userA, ids.observationA, hash, "jpg"), `${ids.userA}/${ids.observationA}/${hash}.jpg`);
});

test("5. upload exitoso termina asociado", async () => {
  const remote = new FakeRemote();
  const result = await run(remote);
  assert.equal(remote.uploads.length, 1);
  assert.equal(result.outbox.items[0].stage, "complete");
});

test("6. objeto remoto existente se verifica y reutiliza", async () => {
  const remote = new FakeRemote();
  const hash = await photos.sha256Photo(jpeg);
  const path = photos.deterministicPhotoPath(ids.userA, ids.observationA, hash, "jpg");
  remote.objects.set(path, jpeg);
  const result = await run(remote);
  assert.equal(result.completed, 1);
  assert.equal(remote.objects.size, 1);
});

test("7. cierre después de upload persiste photo-attach", async () => {
  const storage = new MemoryStorage();
  const remote = new FakeRemote();
  remote.failSnapshotAt = 2;
  const result = await run(remote, { storage });
  assert.equal(result.outbox.items[0].stage, "photo-attach");
  assert.equal(result.failed, 1);
});

test("8. reanudación desde photo-attach no vuelve a subir", async () => {
  const storage = new MemoryStorage();
  const remote = new FakeRemote();
  remote.failSnapshotAt = 2;
  await run(remote, { storage });
  const uploads = remote.uploads.length;
  remote.failSnapshotAt = 0;
  const recovered = await run(remote, { storage });
  assert.equal(recovered.completed, 1);
  assert.equal(remote.uploads.length, uploads);
});

test("9. attach usa exclusivamente la metadata esperada", async () => {
  const remote = new FakeRemote();
  await run(remote);
  assert.deepEqual(Object.keys(remote.attaches[0]).sort(), ["p_expected_revision", "p_observation_id", "p_photo_mime_type", "p_photo_path", "p_photo_sha256", "p_photo_size_bytes"].sort());
});

test("10. attach repetido es idempotente", async () => {
  const storage = new MemoryStorage();
  const remote = new FakeRemote();
  await run(remote, { storage });
  await run(remote, { storage });
  assert.equal(remote.attaches.length, 1);
});

test("11. fallo de red conserva operación pendiente", async () => {
  const remote = new FakeRemote();
  remote.failUpload = true;
  const result = await run(remote);
  assert.equal(result.failed, 1);
  assert.equal(result.outbox.items[0].stage, "photo-upload");
});

test("12. referencia local inexistente es recuperable", async () => {
  const result = await run(new FakeRemote(), { readLocal: async () => undefined });
  assert.equal(result.failed, 1);
  assert.equal(result.outbox.items[0].lastError, "local_photo_unavailable");
});

test("13. múltiples fotografías se procesan", async () => {
  const cp = checkpoint([
    { remoteId: ids.observationA, sourceId: "a", photoRef: "filesystem:a" },
    { remoteId: ids.observationB, sourceId: "b", photoRef: "indexeddb:b" },
  ]);
  const result = await run(new FakeRemote([ids.observationA, ids.observationB]), { checkpoint: cp, readLocal: async (ref) => ref.endsWith("a") ? jpeg : png });
  assert.equal(result.completed, 2);
});

test("14. una foto falla y las demás continúan", async () => {
  const cp = checkpoint([
    { remoteId: ids.observationA, sourceId: "a", photoRef: "filesystem:missing" },
    { remoteId: ids.observationB, sourceId: "b", photoRef: "filesystem:ok" },
  ]);
  const result = await run(new FakeRemote([ids.observationA, ids.observationB]), { checkpoint: cp, readLocal: async (ref) => ref.endsWith("ok") ? jpeg : undefined });
  assert.equal(result.completed, 1);
  assert.equal(result.failed, 1);
});

test("15. outbox y rutas aíslan cuentas A/B", async () => {
  const storage = new MemoryStorage();
  await run(new FakeRemote(), { storage, userId: ids.userA });
  await run(new FakeRemote(), { storage, userId: ids.userB });
  const a = photos.loadPhotoOutbox(ids.userA, storage);
  const b = photos.loadPhotoOutbox(ids.userB, storage);
  assert.notEqual(a.items[0].remotePath, b.items[0].remotePath);
  assert.equal(storage.values.size, 2);
});

const remoteDiscovery = async (bytes = jpeg) => {
  const hash = await photos.sha256Photo(bytes);
  return {
    id: ids.observationA,
    speciesId: "perro-domestico",
    discoveredAt: "2026-10-05T00:00:00.000Z",
    identificationMethod: "demo-manual",
    remotePhoto: {
      path: photos.deterministicPhotoPath(ids.userA, ids.observationA, hash, "jpg"),
      mimeType: "image/jpeg",
      sizeBytes: bytes.byteLength,
      sha256: hash,
    },
  };
};

test("16. descarga remota usa acceso autenticado inyectado", async () => {
  let downloaded;
  const discovery = await remoteDiscovery();
  await photos.resolveDiscoveryPhoto(discovery, ids.userA, {
    remote: { download: async (path) => { downloaded = path; return jpeg; } },
    cacheReference: () => "indexeddb:precheck",
    resolveLocal: async (reference) => reference === "indexeddb:cache" ? "cache-url" : undefined,
    cacheRemote: async () => "indexeddb:cache",
  });
  assert.equal(downloaded, discovery.remotePhoto.path);
});

test("17. hash descargado correcto permite cachear", async () => {
  const result = await photos.resolveDiscoveryPhoto(await remoteDiscovery(), ids.userA, {
    remote: { download: async () => jpeg }, cacheReference: () => "indexeddb:precheck", resolveLocal: async (reference) => reference === "indexeddb:cache" ? "cache-url" : undefined, cacheRemote: async () => "indexeddb:cache",
  });
  assert.equal(result.source, "remote");
});

test("18. hash descargado incorrecto se rechaza", async () => {
  const discovery = await remoteDiscovery();
  await assert.rejects(() => photos.resolveDiscoveryPhoto(discovery, ids.userA, {
    remote: { download: async () => jpeg2 }, resolveLocal: async () => undefined, cacheRemote: async () => "indexeddb:cache",
  }), /remote_photo_hash_mismatch/);
});

test("19. copia local tiene prioridad sobre la remota", async () => {
  const discovery = { ...await remoteDiscovery(), photoRef: "filesystem:local" };
  let downloads = 0;
  const result = await photos.resolveDiscoveryPhoto(discovery, ids.userA, {
    remote: { download: async () => { downloads += 1; return jpeg; } }, resolveLocal: async () => "local-url", cacheRemote: async () => "indexeddb:cache",
  });
  assert.equal(result.source, "local");
  assert.equal(downloads, 0);
});

test("20. local ausente usa fallback remoto", async () => {
  const discovery = { ...await remoteDiscovery(), photoRef: "filesystem:missing" };
  const result = await photos.resolveDiscoveryPhoto(discovery, ids.userA, {
    remote: { download: async () => jpeg }, resolveLocal: async (ref) => ref === "indexeddb:cache" ? "remote-url" : undefined, cacheRemote: async () => "indexeddb:cache",
  });
  assert.equal(result.src, "remote-url");
});

test("21. descarga verificada se entrega al caché", async () => {
  let downloads = 0;
  const result = await photos.resolveDiscoveryPhoto(await remoteDiscovery(), ids.userA, {
    remote: { download: async () => { downloads += 1; return jpeg; } },
    cacheReference: () => "indexeddb:existing-cache",
    resolveLocal: async (reference) => reference === "indexeddb:existing-cache" ? "cached-url" : undefined,
    cacheRemote: async () => { throw new Error("cache should be reused"); },
  });
  assert.equal(result.src, "cached-url");
  assert.equal(downloads, 0);
});

test("22. la sincronización nunca elimina la foto local", async () => {
  const storage = new MemoryStorage();
  await run(new FakeRemote(), { storage });
  assert.deepEqual(storage.removed, []);
});

test("23. implementación usa bucket privado sin URL pública", async () => {
  const source = await readFile(resolve("src/services/photoSyncService.ts"), "utf8");
  assert.match(source, /PHOTO_BUCKET = "observation-photos"/);
  assert.doesNotMatch(source, /getPublicUrl|publicUrl|createSignedUrl/);
});

test("24. cliente no contiene service_role ni secretos", async () => {
  const source = await readFile(resolve("src/services/photoSyncService.ts"), "utf8");
  assert.doesNotMatch(source, /service_role|sb_secret_|SUPABASE_SERVICE/);
});
