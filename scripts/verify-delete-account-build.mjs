import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const outputPath = resolve("dist-site/delete-account/index.html");

await access(outputPath, constants.R_OK);
const html = await readFile(outputPath, "utf8");

if (!/assets\/deleteAccount-[^"']+\.js/.test(html)) {
  throw new Error("La página de eliminación no referencia su bundle compilado.");
}
if (/\/src\/delete-account\/main\.ts/.test(html)) {
  throw new Error("La página de eliminación intenta cargar código fuente sin compilar.");
}
if (!html.includes("Eliminación de cuenta Wildex")) {
  throw new Error("La salida no contiene la página pública de eliminación de Wildex.");
}

console.log("Verified dist-site/delete-account/index.html");
