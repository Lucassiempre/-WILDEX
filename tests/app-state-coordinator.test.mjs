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

const coordinator = await loadModule("src/services/appStateCoordinator.ts");
const anonymous = "anonymous:dataset-1";
const accountA = "account:user-a";
const accountB = "account:user-b";
const capture = { token: "capture-1", dataUrl: "data:image/jpeg;base64,QUJD" };

const state = (discoveries) => ({
  discoveries,
  xp: 20,
  awardedCategoryBonuses: [],
  claimedChallengeIds: [],
  earnedBadgeIds: [],
  badgeAwards: [],
});

const observation = (overrides = {}) => ({
  id: "observation-1",
  speciesId: "hornero",
  discoveredAt: "2026-10-06T10:00:00.000Z",
  identificationMethod: "demo-manual",
  ...overrides,
});

test("captura pendiente no se entrega mientras Auth inicializa", () => {
  assert.equal(coordinator.isNamespaceStable("initializing", anonymous, anonymous), false);
  assert.equal(coordinator.bindCaptureToNamespace(capture, false, anonymous).targetNamespace, undefined);
  assert.equal(coordinator.captureForNamespace(capture, false, anonymous), undefined);
});

test("transición anonymous a account enlaza la captura al namespace definitivo", () => {
  const pending = coordinator.bindCaptureToNamespace(capture, false, anonymous);
  const bound = coordinator.bindCaptureToNamespace(pending, true, accountA);
  assert.equal(bound.targetNamespace, accountA);
  assert.equal(coordinator.captureForNamespace(bound, true, anonymous), undefined);
  assert.equal(coordinator.captureForNamespace(bound, true, accountA), bound);
});

test("captura sólo se consume cuando preview y savedPhoto fueron aplicados", () => {
  assert.equal(coordinator.isCaptureApplied(undefined, capture.dataUrl, capture.dataUrl), false);
  assert.equal(coordinator.isCaptureApplied(capture.dataUrl, undefined, capture.dataUrl), false);
  assert.equal(coordinator.isCaptureApplied(capture.dataUrl, capture.dataUrl, capture.dataUrl), true);
});

test("captura se consume una sola vez en su namespace", () => {
  const bound = coordinator.bindCaptureToNamespace(capture, true, accountA);
  assert.equal(coordinator.consumeCapture(bound, "otro-token", accountA), bound);
  assert.equal(coordinator.consumeCapture(bound, capture.token, accountB), bound);
  assert.equal(coordinator.consumeCapture(bound, capture.token, accountA), undefined);
  assert.equal(coordinator.consumeCapture(undefined, capture.token, accountA), undefined);
});

test("preview y savedPhoto válidos sobreviven hasta confirmar la aplicación", () => {
  const preview = capture.dataUrl;
  const savedPhoto = capture.dataUrl;
  assert.equal(coordinator.isCaptureApplied(preview, savedPhoto, capture.dataUrl), true);
  assert.equal(preview.length, savedPhoto.length);
});

test("hidratación antigua no elimina una observación creada posteriormente", () => {
  const baseline = state([observation()]);
  const hydrated = state([observation({ photo: "data:image/jpeg;base64,T0xE" })]);
  const recent = observation({ id: "observation-2", speciesId: "paloma-domestica", notes: "Nueva" });
  const current = { ...baseline, discoveries: [...baseline.discoveries, recent], xp: 40 };
  const result = coordinator.reconcileHydratedExplorerState(baseline, hydrated, current);
  assert.deepEqual(result.discoveries.map((item) => item.id), ["observation-1", "observation-2"]);
  assert.equal(result.xp, 40);
});

test("hidratación conserva cambios recientes de photo, photoRef y remotePhoto", () => {
  const oldRemote = { path: "old/path.jpg", mimeType: "image/jpeg", sizeBytes: 10, sha256: "old" };
  const newRemote = { path: "new/path.jpg", mimeType: "image/jpeg", sizeBytes: 20, sha256: "new" };
  const baselineDiscovery = observation({ photoRef: "filesystem:old.jpg", remotePhoto: oldRemote });
  const baseline = state([baselineDiscovery]);
  const hydrated = state([observation({ photo: "data:image/jpeg;base64,SElEUkFURUQ=", photoRef: "filesystem:old.jpg", remotePhoto: oldRemote })]);
  const current = state([observation({ photo: "data:image/jpeg;base64,TkVX", photoRef: "filesystem:new.jpg", remotePhoto: newRemote, notes: "Editada" })]);
  const result = coordinator.reconcileHydratedExplorerState(baseline, hydrated, current).discoveries[0];
  assert.equal(result.photo, current.discoveries[0].photo);
  assert.equal(result.photoRef, current.discoveries[0].photoRef);
  assert.deepEqual(result.remotePhoto, newRemote);
  assert.equal(result.notes, "Editada");
});

test("logout y cambio de cuenta no filtran capturas entre namespaces", () => {
  const bound = coordinator.bindCaptureToNamespace(capture, true, accountA);
  assert.equal(coordinator.captureForNamespace(bound, true, accountB), undefined);
  assert.equal(coordinator.captureForNamespace(bound, true, anonymous), undefined);
  assert.equal(coordinator.captureForNamespace(bound, true, accountA), bound);
});

test("photo-sync-metadata preserva el estado reciente", () => {
  const remote = { path: "user/observation-1/photo.jpg", mimeType: "image/jpeg", sizeBytes: 30, sha256: "hash" };
  const current = state([observation({ photo: capture.dataUrl, photoRef: "filesystem:observation-1.jpg", notes: "Reciente" })]);
  const result = coordinator.applyPhotoSyncMetadata(current, new Map([["observation-1", remote]]));
  assert.equal(result.discoveries[0].photo, capture.dataUrl);
  assert.equal(result.discoveries[0].photoRef, "filesystem:observation-1.jpg");
  assert.equal(result.discoveries[0].notes, "Reciente");
  assert.deepEqual(result.discoveries[0].remotePhoto, remote);
});
