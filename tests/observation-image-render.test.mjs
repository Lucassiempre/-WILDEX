import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const aliasPlugin = {
  name: "observation-image-alias",
  setup(buildApi) {
    const map = {
      react: resolve("tests/stubs/react-stub.mjs"),
      "react/jsx-runtime": resolve("tests/stubs/jsx-runtime-stub.mjs"),
      "../auth/AuthProvider": resolve("tests/stubs/auth-stub.mjs"),
      "./AnimalImage": resolve("tests/stubs/animal-image-stub.mjs"),
      "../services/photoStorageService": resolve("tests/stubs/photo-storage-service-stub.mjs"),
      "../services/photoSyncService": resolve("tests/stubs/photo-sync-service-stub.mjs"),
    };
    buildApi.onResolve({ filter: /.*/ }, (args) => (map[args.path] ? { path: map[args.path] } : undefined));
  },
};

async function loadObservationImage() {
  const output = await build({
    entryPoints: [resolve("src/components/ObservationImage.tsx")],
    bundle: true,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    write: false,
    logLevel: "silent",
    plugins: [aliasPlugin],
  });
  const m = { exports: {} };
  new Function("module", "exports", output.outputFiles[0].text)(m, m.exports);
  return m.exports;
}

const react = await import(pathToFileURL(resolve("tests/stubs/react-stub.mjs")).href);
const photoStorage = await import(pathToFileURL(resolve("tests/stubs/photo-storage-service-stub.mjs")).href);
const photoSync = await import(pathToFileURL(resolve("tests/stubs/photo-sync-service-stub.mjs")).href);
const { ObservationImage } = await loadObservationImage();

const renderPage = (discovery, fallback = "fallback.svg") => {
  react.__beginRender();
  return ObservationImage({ discovery, fallback, alt: "foto", className: "" });
};

test("1. discovery.photo data:image tiene prioridad absoluta sobre photoRef", () => {
  react.__reset();
  const discovery = { id: "d1", photo: "data:image/jpeg;base64,QUJD", photoRef: "filesystem:observation-photos/d1.jpg" };
  const el = renderPage(discovery);
  assert.equal(el.props.src, "data:image/jpeg;base64,QUJD");
  // No effect scheduled for resolution since photo exists.
  assert.equal(react.__state.effects().length, 1);
  assert.equal(photoStorage.state.calls, 0);
  assert.equal(photoSync.state.calls, 0);
});

test("2. con photo presente no se llama al resolver de photoRef", () => {
  const el = renderPage({ id: "d1", photo: "data:image/jpeg;base64,QUJD", photoRef: "filesystem:x.jpg" });
  // Execute the registered effect (must exit early).
  const eff = react.__state.effects()[0].fn;
  assert.equal(typeof eff, "function"); eff();
  assert.equal(photoStorage.state.calls, 0);
  assert.equal(photoSync.state.calls, 0);
  assert.equal(react.__state.src, "data:image/jpeg;base64,QUJD");
});

test("3. una resolución asíncrona vieja no puede sobrescribir un discovery.photo nuevo", async () => {
  react.__reset();
  photoStorage.state.calls = 0;
  // First render: no photo -> starts async resolution.
  let resolveOld;
  photoStorage.state.next = () => new Promise((r) => { resolveOld = r; });
  const el1 = renderPage({ id: "d1", photoRef: "filesystem:observation-photos/d1.jpg" }, "fallback.svg");
  const eff1 = react.__state.effects()[0].fn;
  const cleanup1 = eff1();
  assert.equal(photoStorage.state.calls, 1);

  // New discovery arrives with photo before the old promise settles.
  const el2 = renderPage({ id: "d1", photo: "data:image/jpeg;base64,TkVX", photoRef: "filesystem:observation-photos/d1.jpg" }, "fallback.svg");
  const eff2 = react.__state.effects().slice(-1)[0].fn;
  const cleanup2 = eff2();
  cleanup1?.();

  // Old promise resolves late: it must NOT overwrite the new photo.
  resolveOld("https://localhost/_capacitor_file_/old.jpg");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(react.__state.src, "data:image/jpeg;base64,TkVX");
  cleanup2?.();
});

test("4. sin discovery.photo, photoRef sigue resolviéndose", async () => {
  react.__reset();
  photoStorage.state.calls = 0;
  photoStorage.state.next = () => Promise.resolve("https://localhost/_capacitor_file_/resolved.jpg");
  const el = renderPage({ id: "d2", photoRef: "filesystem:observation-photos/d2.jpg" }, "fallback.svg");
  const eff = react.__state.effects().slice(-1)[0].fn;
  const cleanup = eff();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(photoStorage.state.calls, 1);
  assert.equal(react.__state.src, "https://localhost/_capacitor_file_/resolved.jpg");
  cleanup?.();
});

test("5. si photoRef no se puede resolver, se mantiene el fallback", async () => {
  react.__reset();
  photoStorage.state.calls = 0;
  photoStorage.state.next = () => Promise.resolve(undefined);
  const el = renderPage({ id: "d3", photoRef: "filesystem:observation-photos/d3.jpg" }, "fallback.svg");
  const eff = react.__state.effects().slice(-1)[0].fn;
  const cleanup = eff();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(react.__state.src, "fallback.svg");
  cleanup?.();
});
