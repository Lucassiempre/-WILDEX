import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const output = resolve("dist-site");
const html = await readFile(join(output, "index.html"), "utf8");
const playUrl = "https://play.google.com/apps/testing/com.mrlabs.wildex";
const apkUrl = "https://lucassiempre.github.io/-WILDEX/downloads/Wildex-1.0.0-beta.apk";

assert(!/<link\b[^>]*\brel\s*=\s*["']manifest["']/i.test(html), "La landing referencia un manifest PWA.");
assert(!/<meta\b[^>]*\bname\s*=\s*["'](?:apple-mobile-web-app-capable|mobile-web-app-capable|application-name|msapplication-[^"']+)["']/i.test(html), "La landing incluye metadata de instalacion.");
assert(html.includes("worker-src 'none'"), "La CSP debe bloquear workers.");
assert(html.includes("manifest-src 'none'"), "La CSP debe bloquear manifests.");
assert(html.includes(`href="${playUrl}"`), "Falta el enlace de la prueba cerrada de Google Play.");
assert(html.includes(`href="${apkUrl}" download="Wildex-1.0.0-beta.apk"`), "El APK debe descargarse directamente.");
assert(html.includes('id="beta-form"') && html.includes('id="tester-consent"'), "Falta el formulario de testers.");
assert(/href="[^"]*privacy\/"/.test(html), "Falta el enlace de privacidad.");
assert(/src="[^"]*images\/wildex-qr\.svg"/.test(html), "Falta el QR de la landing.");

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspect(path);
      continue;
    }
    assert(!/\.webmanifest$|^manifest\.json$|^(?:sw|service[-.]?worker|registerSW|workbox.*)(?:[.-].*)?\.js$/i.test(entry.name), `Asset PWA inesperado: ${path}`);
    if (/\.(?:html|js)$/.test(entry.name)) {
      const source = await readFile(path, "utf8");
      assert(!/beforeinstallprompt|serviceWorker\s*(?:\?\.)?\s*\.\s*register\s*\(|navigator\.install\s*\(|display\s*:\s*["']standalone["']/i.test(source), `Logica PWA inesperada: ${path}`);
    }
  }
}

await inspect(output);
await access(join(output, "downloads/Wildex-1.0.0-beta.apk"));
await access(join(output, "privacy/index.html"));
console.log("Verified landing: no PWA assets/install logic, direct Play/APK links, QR, privacy and tester form.");
