const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { resolve, join, sep } = require("node:path");

function verifyAppBuild(directory = resolve("dist-app")) {
  const output = resolve(directory);
  let marker;
  try {
    marker = JSON.parse(readFileSync(join(output, "wildex-build.json"), "utf8"));
  } catch {
    throw new Error("Falta un build de la app verificado. Ejecuta npm run build:app antes de cap sync/copy.");
  }
  assert.deepEqual(marker, { target: "app", entry: "src/main.tsx" }, "Capacitor solo puede copiar el build de la app Wildex.");
  const html = readFileSync(join(output, "index.html"), "utf8");
  assert(/<div\s+id="root"\s*>\s*<\/div>/.test(html), "La entrada debe montar la app React.");
  assert(!/beta-form|site-shell|Instalar desde Google Play|src\/landing/.test(html), "La landing no puede ser la entrada Android.");
  const entry = html.match(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/)?.[1];
  assert(entry?.startsWith("./assets/"), "La app debe usar su bundle compilado y rutas relativas.");
  const entryPath = resolve(output, entry);
  assert(entryPath.startsWith(output + sep), "El bundle debe estar dentro del build de la app.");
  readFileSync(entryPath);
  for (const file of readdirSync(output)) {
    assert(!["privacy", "delete-account", "downloads"].includes(file), "El build Android no debe contener paginas publicas ni APKs.");
  }
  return { directory: output, entryPath };
}

module.exports = { verifyAppBuild };

if (require.main === module) {
  const result = verifyAppBuild(process.argv[2]);
  console.log(`Verified Wildex app build: ${result.directory}; React entry, relative assets, no landing.`);
}
