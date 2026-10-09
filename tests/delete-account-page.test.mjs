import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

async function loadModule(path) {
  const output = await build({
    entryPoints: [resolve(path)],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    logLevel: "silent",
  });
  const module = { exports: {} };
  new Function("module", "exports", output.outputFiles[0].text)(module, module.exports);
  return module.exports;
}

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

const webClient = await loadModule("src/delete-account/deleteAccountWebClient.ts");

test("Vite declara la página de eliminación como entrada multipágina", async () => {
  const config = await readFile(resolve("vite.config.ts"), "utf8");
  assert.match(config, /deleteAccount:\s*resolve\(projectDirectory,\s*"site\/delete-account\/index\.html"\)/);
  assert.match(config, /landing:\s*resolve\(projectDirectory,\s*"site\/index\.html"\)/);
});

test("la URL de retorno coincide exactamente con GitHub Pages", () => {
  assert.equal(
    webClient.buildDeleteAccountRedirectUrl("https://lucassiempre.github.io", "/-WILDEX/"),
    "https://lucassiempre.github.io/-WILDEX/delete-account/",
  );
});

test("la página exige la confirmación literal ELIMINAR", () => {
  assert.equal(webClient.isDeleteAccountConfirmationValid("ELIMINAR"), true);
  assert.equal(webClient.isDeleteAccountConfirmationValid("eliminar"), false);
  assert.equal(webClient.isDeleteAccountConfirmationValid(" ELIMINAR"), false);
  assert.equal(webClient.isDeleteAccountConfirmationValid("ELIMINAR "), false);
});

test("la página explica alcance, permanencia y límite de datos locales", async () => {
  const html = await readFile(resolve("site/delete-account/index.html"), "utf8");
  assert.match(html, /Eliminación de cuenta Wildex/);
  assert.match(html, /Desarrollado por MrLabs/);
  assert.match(html, /permanente y no se puede deshacer/);
  assert.match(html, /fotografías sincronizadas/);
  assert.match(html, /XP, desafíos, reclamos e insignias/);
  assert.match(html, /exclusivamente de forma local en otro dispositivo/);
});

test("OAuth usa PKCE y conserva su estado únicamente en sessionStorage", async () => {
  const source = await readFile(resolve("src/delete-account/deleteAccountWebClient.ts"), "utf8");
  assert.match(source, /flowType:\s*"pkce"/);
  assert.match(source, /storage:\s*sessionStorage|window\.sessionStorage/);
  assert.doesNotMatch(source, /localStorage/);
  assert.match(source, /exchangeCodeForSession/);
});

test("la invocación delete-account no envía userId ni body de identidad", async () => {
  const source = await readFile(resolve("src/delete-account/deleteAccountWebClient.ts"), "utf8");
  const invocation = source.match(/functions\.invoke[\s\S]*?\}\);/u)?.[0] ?? "";
  assert.match(invocation, /"delete-account"/);
  assert.match(invocation, /method:\s*"POST"/);
  assert.doesNotMatch(invocation, /userId|body\s*:/);
});

test("el frontend de eliminación no contiene secretos privilegiados", async () => {
  const files = [
    resolve("site/delete-account/index.html"),
    ...await walkFiles(resolve("src/delete-account")),
  ];
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(source, /sb_secret_|service[_-]?role|SUPABASE_SERVICE_ROLE_KEY|client[_-]?secret|storePassword|keyPassword|\.jks|\.keystore/i);
});

test("el workflow publica exclusivamente el directorio dist-site", async () => {
  const workflow = await readFile(resolve(".github/workflows/deploy.yml"), "utf8");
  assert.match(workflow, /run:\s*npm run build:site/);
  assert.match(workflow, /path:\s*dist-site/);
  assert.match(workflow, /VITE_SUPABASE_URL/);
  assert.match(workflow, /VITE_SUPABASE_PUBLISHABLE_KEY/);
});
