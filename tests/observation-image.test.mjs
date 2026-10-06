import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";
import { build } from "esbuild";

async function loadModuleWithAndroidStubs(path) {
  const output = await build({
    entryPoints: [resolve(path)],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    logLevel: "silent",
    alias: {
      "@capacitor/core": resolve("tests/stubs/capacitor-core.mjs"),
      "@capacitor/filesystem": resolve("tests/stubs/capacitor-filesystem.mjs"),
    },
  });
  const module = { exports: {} };
  new Function("module", "exports", output.outputFiles[0].text)(module, module.exports);
  return module.exports;
}

const storage = await loadModuleWithAndroidStubs("src/services/photoStorageService.ts");
const { seedPhotoFile } = await import("node:url").then(({ pathToFileURL }) => import(pathToFileURL(resolve("tests/stubs/capacitor-filesystem.mjs")).href));

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 5, 6, 7, 8]);

test("foto existente + filesystem: válido produce src renderizable (data: URL), no la URL _capacitor_file_", async () => {
  seedPhotoFile("observation-photos/obs-1.jpg", jpeg);
  const resolved = await storage.resolveObservationPhoto("filesystem:observation-photos/obs-1.jpg");
  assert.ok(resolved, "debe resolverse");
  assert.ok(resolved.startsWith("data:image/jpeg;base64,"), `debe ser data URL, recibido: ${resolved.slice(0, 60)}`);
  assert.ok(!resolved.startsWith("https://localhost/_capacitor_file_"), "no debe depender de _capacitor_file_");
  const decoded = Buffer.from(resolved.split(",")[1], "base64");
  assert.deepEqual(Uint8Array.from(decoded), jpeg);
});

test("filesystem: con fotografía vacía devuelve undefined (el <img> conserva fallback, no queda src roto)", async () => {
  seedPhotoFile("observation-photos/vacia.jpg", new Uint8Array(0));
  const resolved = await storage.resolveObservationPhoto("filesystem:observation-photos/vacia.jpg");
  assert.equal(resolved, undefined);
});

test("ObservationImage convierte el photoRef resuelto en <img>, no en ImageOff", async () => {
  const source = await readFile(resolve("src/components/ObservationImage.tsx"), "utf8");
  assert.match(source, /resolveObservationPhoto\(discovery\.photoRef\)/);
  assert.match(source, /AnimalImage src=\{src\}/);
  const animalImage = await readFile(resolve("src/components/AnimalImage.tsx"), "utf8");
  assert.match(animalImage, /<img src=\{src\}/);
  assert.match(animalImage, /onError=\{\(\) => setFailed\(true\)\}/);
});
