import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

async function loadModule(path) {
  const output = await build({ entryPoints: [resolve(path)], bundle: true, platform: "node", format: "cjs", jsx: "automatic", write: false, logLevel: "silent" });
  const module = { exports: {} };
  new Function("module", "exports", output.outputFiles[0].text)(module, module.exports);
  return module.exports;
}

const edge = await loadModule("supabase/functions/_shared/deleteAccountCore.ts");
const cleanup = await loadModule("src/services/accountLocalCleanupService.ts");
const dialog = await loadModule("src/components/DeleteAccountDialog.tsx");

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const DATASET = "33333333-3333-4333-8333-333333333333";

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

const stateDocument = (namespace, discoveries = []) => JSON.stringify({
  schemaVersion: 3,
  namespace,
  kind: "explorer-state",
  updatedAt: "2026-10-06T12:00:00.000Z",
  data: { discoveries, xp: 0, awardedCategoryBonuses: [], claimedChallengeIds: [], earnedBadgeIds: [], badgeAwards: [] },
});

const profileDocument = (namespace) => JSON.stringify({ schemaVersion: 3, namespace, kind: "explorer-profile", updatedAt: "2026-10-06T12:00:00.000Z", data: {} });

const requestDependencies = ({ verifiedUser = USER_A, failStorage = false } = {}) => {
  const deletedUsers = [];
  return {
    deletedUsers,
    dependencies: {
      verifyToken: async () => ({ userId: verifiedUser }),
      storage: {
        list: async () => ({ data: [], error: null }),
        remove: async () => ({ error: failStorage ? new Error("storage") : null }),
      },
      deleteAuthUser: async (userId) => { deletedUsers.push(userId); return { error: null }; },
    },
  };
};

test("delete-account rechaza solicitudes sin JWT", async () => {
  const setup = requestDependencies();
  const result = await edge.executeDeleteAccountRequest({ method: "POST" }, setup.dependencies);
  assert.equal(result.status, 401);
  assert.deepEqual(setup.deletedUsers, []);
});

test("delete-account ignora cualquier userId del cliente y usa sólo el JWT verificado", async () => {
  const setup = requestDependencies({ verifiedUser: USER_A });
  const result = await edge.executeDeleteAccountRequest({ method: "POST", authorization: "Bearer valid", body: { userId: USER_B } }, setup.dependencies);
  assert.equal(result.status, 200);
  assert.deepEqual(setup.deletedUsers, [USER_A]);
});

test("la enumeración paginada elimina sólo objetos bajo el prefijo autenticado", async () => {
  const root = Array.from({ length: 101 }, (_, index) => ({ id: `id-${index}`, name: `file-${String(index).padStart(3, "0")}.jpg`, metadata: {} }));
  root.push({ id: null, name: "nested", metadata: null });
  const removed = [];
  const existing = new Set([...root.filter((entry) => entry.id).map((entry) => `${USER_A}/${entry.name}`), `${USER_A}/nested/photo.webp`]);
  const storage = {
    list: async (prefix, { limit, offset }) => {
      const rows = prefix === USER_A
        ? root.filter((entry) => entry.id == null || existing.has(`${USER_A}/${entry.name}`))
        : prefix === `${USER_A}/nested` && existing.has(`${USER_A}/nested/photo.webp`) ? [{ id: "nested-id", name: "photo.webp", metadata: {} }] : [];
      return { data: rows.slice(offset, offset + limit), error: null };
    },
    remove: async (paths) => { removed.push(...paths); paths.forEach((path) => existing.delete(path)); return { error: null }; },
  };
  await edge.deleteAccountData(USER_A, { storage, deleteAuthUser: async () => ({ error: null }) });
  assert.equal(removed.length, 102);
  assert.ok(removed.every((path) => path.startsWith(`${USER_A}/`)));
  assert.ok(removed.includes(`${USER_A}/nested/photo.webp`));
});

test("un fallo de Storage impide borrar Auth y permite reintentar", async () => {
  let fail = true;
  let authDeletes = 0;
  let exists = true;
  const storage = {
    list: async () => ({ data: exists ? [{ id: "photo", name: "photo.jpg", metadata: {} }] : [], error: null }),
    remove: async () => fail ? (fail = false, { error: new Error("temporary") }) : (exists = false, { error: null }),
  };
  const dependencies = { storage, deleteAuthUser: async () => { authDeletes += 1; return { error: null }; } };
  await assert.rejects(edge.deleteAccountData(USER_A, dependencies), /storage_delete_failed/);
  assert.equal(authDeletes, 0);
  assert.deepEqual(await edge.deleteAccountData(USER_A, dependencies), { ok: true, deleted: true });
  assert.equal(authDeletes, 1);
});

test("la limpieza local borra sólo cuenta A y conserva anonymous, cuenta B y fotos compartidas", async () => {
  const storage = new MemoryStorage();
  const anonymous = `anonymous:${DATASET}`;
  const accountA = `account:${USER_A}`;
  const accountB = `account:${USER_B}`;
  const sharedRef = "filesystem:observation-photos/shared.jpg";
  const exclusiveRef = "filesystem:observation-photos/a-only.jpg";
  storage.setItem(`wildex-explorer-state-v3:${anonymous}`, stateDocument(anonymous, [{ id: "anon", speciesId: "hornero", discoveredAt: "2026-10-01T00:00:00Z", identificationMethod: "demo-manual", photoRef: sharedRef }]));
  storage.setItem(`wildex-explorer-profile-v3:${anonymous}`, profileDocument(anonymous));
  storage.setItem(`wildex-explorer-state-v3:${accountA}`, stateDocument(accountA, [
    { id: "shared", speciesId: "hornero", discoveredAt: "2026-10-01T00:00:00Z", identificationMethod: "demo-manual", photoRef: sharedRef },
    { id: "exclusive", speciesId: "perro-domestico", discoveredAt: "2026-10-02T00:00:00Z", identificationMethod: "demo-manual", photoRef: exclusiveRef },
  ]));
  storage.setItem(`wildex-explorer-profile-v3:${accountA}`, profileDocument(accountA));
  storage.setItem(`wildex-explorer-state-v3:${accountB}`, stateDocument(accountB, []));
  storage.setItem(`wildex-explorer-profile-v3:${accountB}`, profileDocument(accountB));
  storage.setItem(`wildex-initial-sync-v1:${DATASET}:${USER_A}:hash`, JSON.stringify({ schemaVersion: 1, datasetId: DATASET, userId: USER_A, manifestHash: "hash" }));
  storage.setItem(`wildex-photo-outbox-v1:${USER_A}`, JSON.stringify({ schemaVersion: 1, userId: USER_A, items: [] }));
  const removedPhotos = [];
  const protectedPhotos = [];
  let captureCleared = false;

  await cleanup.cleanupAccountLocalData(USER_A, {
    storage,
    removePhotos: async (_userId, references, protectedReferences) => {
      removedPhotos.push(...references);
      protectedPhotos.push(...protectedReferences);
    },
    clearCapture: () => { captureCleared = true; },
  });

  assert.equal(storage.getItem(`wildex-explorer-state-v3:${accountA}`), null);
  assert.notEqual(storage.getItem(`wildex-explorer-state-v3:${anonymous}`), null);
  assert.notEqual(storage.getItem(`wildex-explorer-state-v3:${accountB}`), null);
  assert.equal(storage.getItem(`wildex-photo-outbox-v1:${USER_A}`), null);
  assert.equal(storage.getItem(`wildex-initial-sync-v1:${DATASET}:${USER_A}:hash`), null);
  assert.deepEqual(removedPhotos, [exclusiveRef]);
  assert.ok(protectedPhotos.includes(sharedRef));
  assert.equal(captureCleared, true);
});

test("la confirmación exige ELIMINAR exactamente", () => {
  assert.equal(dialog.isDeleteConfirmationValid("ELIMINAR"), true);
  assert.equal(dialog.isDeleteConfirmationValid("eliminar"), false);
  assert.equal(dialog.isDeleteConfirmationValid(" ELIMINAR"), false);
  assert.equal(dialog.isDeleteConfirmationValid("ELIMINAR "), false);
});

test("migración 009 cubre el grafo privado sin debilitar catálogos", async () => {
  const sql = await readFile(resolve("supabase/migrations/202610060009_account_deletion_cascades.sql"), "utf8");
  for (const table of ["observations", "challenge_claims", "sync_import_challenge_claims", "sync_import_observations", "sync_legacy_observation_map"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table}`));
  }
  assert.doesNotMatch(sql, /alter table public\.(species|species_variants|challenges|badges)\b/);
  assert.doesNotMatch(sql, /drop table|delete\s+from|truncate/i);
});

test("el diagnóstico 009 verifica todas las tablas privadas de la cuenta", async () => {
  const sql = await readFile(resolve("supabase/diagnostics/13_account_deletion_cascades.sql"), "utf8");
  for (const table of [
    "profiles", "observations", "user_species_discoveries", "user_variant_discoveries", "xp_events",
    "challenge_claims", "user_badges", "profile_featured_badges", "sync_imports",
    "sync_import_challenge_claims", "sync_import_observations", "sync_legacy_observation_map",
  ]) assert.match(sql, new RegExp(table));
  assert.doesNotMatch(sql, /^\s*(insert|update|delete|alter|create|drop|truncate|grant|revoke)\b/im);
});

const walkFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(path));
    else files.push(path);
  }
  return files;
};

test("ningún secreto privilegiado forma parte del cliente", async () => {
  const files = await walkFiles(resolve("src"));
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(source, /Deno\.env/);
});
