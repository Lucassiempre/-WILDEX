import assert from "node:assert/strict";
import { test } from "node:test";
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

const configuration = await loadModule("src/config/supabaseConfig.ts");
const clientModule = await loadModule("src/lib/supabaseClient.ts");
const validEnvironment = {
  VITE_SUPABASE_URL: "https://wildex-test.supabase.co/",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_public_key_123456",
};

test("configuración Supabase normaliza los valores públicos", () => {
  assert.deepEqual(configuration.readSupabaseConfig({
    VITE_SUPABASE_URL: `  ${validEnvironment.VITE_SUPABASE_URL}  `,
    VITE_SUPABASE_PUBLISHABLE_KEY: `  ${validEnvironment.VITE_SUPABASE_PUBLISHABLE_KEY}  `,
  }), {
    url: "https://wildex-test.supabase.co",
    publishableKey: validEnvironment.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
});

test("configuración Supabase informa cada variable faltante", () => {
  assert.throws(
    () => configuration.readSupabaseConfig({}),
    /Falta VITE_SUPABASE_URL/,
  );
  assert.throws(
    () => configuration.readSupabaseConfig({ VITE_SUPABASE_URL: validEnvironment.VITE_SUPABASE_URL }),
    /Falta VITE_SUPABASE_PUBLISHABLE_KEY/,
  );
});

test("configuración Supabase rechaza URL insegura y claves privadas", () => {
  assert.throws(
    () => configuration.readSupabaseConfig({ ...validEnvironment, VITE_SUPABASE_URL: "http://wildex.example.com" }),
    /debe usar HTTPS/,
  );
  assert.throws(
    () => configuration.readSupabaseConfig({ ...validEnvironment, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_forbidden" }),
    /sólo admite una publishable key/,
  );
});

test("cliente Supabase se inicializa sin abrir sesión ni realizar solicitudes", () => {
  const storage = {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  };
  const client = clientModule.createWildexSupabaseClient(validEnvironment, storage);
  assert.equal(client.supabaseUrl, "https://wildex-test.supabase.co");
  assert.equal(client.supabaseKey, validEnvironment.VITE_SUPABASE_PUBLISHABLE_KEY);
  assert.ok(client.auth);
});
