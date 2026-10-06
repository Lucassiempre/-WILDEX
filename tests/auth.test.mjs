import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

async function loadModule(path) {
  const output = await build({ entryPoints: [resolve(path)], bundle: true, platform: "node", format: "cjs", jsx: "automatic", write: false, logLevel: "silent" });
  const module = { exports: {} };
  new Function("module", "exports", output.outputFiles[0].text)(module, module.exports);
  return module.exports;
}

const oauth = await loadModule("src/auth/nativeOAuth.ts");
const storageModule = await loadModule("src/services/authStorage.ts");
const accountPanel = await loadModule("src/components/AuthAccountPanel.tsx");

test("el callback nativo acepta únicamente el deep link exacto de Wildex", () => {
  assert.deepEqual(oauth.parseNativeOAuthCallback("https://example.com/?code=secret"), { kind: "ignore" });
  assert.deepEqual(oauth.parseNativeOAuthCallback("com.mrlabs.wildex://other/callback?code=secret"), { kind: "ignore" });
  assert.deepEqual(oauth.parseNativeOAuthCallback("com.mrlabs.wildex://auth/callback?code=oauth-code&sb_flow_id=flow-1"), {
    kind: "code",
    code: "oauth-code",
    flowId: "flow-1",
  });
});

test("el callback distingue cancelación, error y retorno incompleto", () => {
  assert.deepEqual(oauth.parseNativeOAuthCallback("com.mrlabs.wildex://auth/callback?error=access_denied"), { kind: "cancelled" });
  assert.equal(oauth.parseNativeOAuthCallback("com.mrlabs.wildex://auth/callback?error=server_error").kind, "error");
  assert.equal(oauth.parseNativeOAuthCallback("com.mrlabs.wildex://auth/callback").kind, "error");
});

test("el almacenamiento web de autenticación permanece sólo en memoria", async () => {
  const storage = storageModule.createMemoryAuthStorage();
  assert.equal(await storage.getItem("session"), null);
  await storage.setItem("session", "value");
  assert.equal(await storage.getItem("session"), "value");
  await storage.removeItem("session");
  assert.equal(await storage.getItem("session"), null);
});

test("el adaptador nativo delega las sesiones al almacenamiento seguro", async () => {
  const calls = [];
  const secureStorage = {
    getItem: async (key) => { calls.push(["get", key]); return "encrypted-value"; },
    setItem: async (key, value) => { calls.push(["set", key, value]); },
    removeItem: async (key) => { calls.push(["remove", key]); },
  };
  const storage = storageModule.createNativeAuthStorage(secureStorage);
  assert.equal(await storage.getItem("session"), "encrypted-value");
  await storage.setItem("session", "new-value");
  await storage.removeItem("session");
  assert.deepEqual(calls, [["get", "session"], ["set", "session", "new-value"], ["remove", "session"]]);
});

test("Android declara el callback OAuth exacto y la UI expone las acciones de cuenta", async () => {
  const manifest = await readFile(resolve("android/app/src/main/AndroidManifest.xml"), "utf8");
  assert.match(manifest, /android:scheme="com\.mrlabs\.wildex"/);
  assert.match(manifest, /android:host="auth"/);
  assert.match(manifest, /android:path="\/callback"/);
});

test("el panel de cuenta representa sesión, carga y acceso Android", () => {
  const baseProps = { error: null, isAndroid: true, onSignIn() {}, onSignOut() {}, onDismiss() {} };
  const progressLink = { available: true, busy: false, resumable: false, completed: false, profileConflict: false, onStart() {}, onResolveProfile() {} };
  const signedOut = renderToStaticMarkup(React.createElement(accountPanel.AuthAccountView, { ...baseProps, account: null, status: "signed-out" }));
  const loading = renderToStaticMarkup(React.createElement(accountPanel.AuthAccountView, { ...baseProps, account: null, status: "waiting" }));
  const signedIn = renderToStaticMarkup(React.createElement(accountPanel.AuthAccountView, { ...baseProps, account: { name: "Martina", email: "martina@example.com" }, status: "signed-in" }));
  const pendingAnonymous = renderToStaticMarkup(React.createElement(accountPanel.AuthAccountView, { ...baseProps, account: { name: "Martina", email: "martina@example.com" }, status: "signed-in", anonymousProgressPending: true, progressLink }));

  assert.match(signedOut, /Continuar con Google/);
  assert.match(loading, /Esperando a Google/);
  assert.match(loading, /disabled/);
  assert.match(signedIn, /martina@example\.com/);
  assert.match(signedIn, /Cerrar sesión/);
  assert.doesNotMatch(signedIn, /progreso guardado en este dispositivo/);
  assert.match(pendingAnonymous, /Tenés progreso guardado en este dispositivo/);
  assert.match(pendingAnonymous, /Vincular progreso con mi cuenta/);
});
