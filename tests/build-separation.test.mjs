import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { verifyAppBuild } from "../scripts/verify-app-build.cjs";

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), "wildex-app-build-test-"));
  try {
    await mkdir(join(directory, "assets"));
    await writeFile(join(directory, "wildex-build.json"), JSON.stringify({ target: "app", entry: "src/main.tsx" }));
    await writeFile(join(directory, "index.html"), '<div id="root"></div><script type="module" src="./assets/app.js"></script>');
    await writeFile(join(directory, "assets/app.js"), "console.log('app');");
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("Capacitor acepta una app compilada con assets relativos", async () => {
  await fixture(async directory => assert.equal(verifyAppBuild(directory).entryPath, join(directory, "assets/app.js")));
});

test("Capacitor rechaza la landing incluso con un marcador app", async () => {
  await fixture(async directory => {
    await writeFile(join(directory, "index.html"), '<main class="site-shell"><form id="beta-form"></form></main>');
    assert.throws(() => verifyAppBuild(directory), /React|landing/);
  });
});

test("Capacitor rechaza un build publico y un build inexistente", async () => {
  await fixture(async directory => {
    await writeFile(join(directory, "wildex-build.json"), JSON.stringify({ target: "site", entry: "src/landing/main.ts" }));
    assert.throws(() => verifyAppBuild(directory), /solo puede copiar/);
    assert.throws(() => verifyAppBuild(join(directory, "missing")), /npm run build:app/);
  });
});

test("Capacitor rechaza assets absolutos y descargas mezcladas", async () => {
  await fixture(async directory => {
    await writeFile(join(directory, "index.html"), '<div id="root"></div><script type="module" src="/-WILDEX/assets/app.js"></script>');
    assert.throws(() => verifyAppBuild(directory), /rutas relativas/);
    await writeFile(join(directory, "index.html"), '<div id="root"></div><script type="module" src="./assets/app.js"></script>');
    await mkdir(join(directory, "downloads"));
    assert.throws(() => verifyAppBuild(directory), /paginas publicas/);
  });
});

test("las entradas app y sitio quedan separadas y sync usa dist-app", async () => {
  const app = await readFile(resolve("index.html"), "utf8");
  const site = await readFile(resolve("site/index.html"), "utf8");
  const capacitor = await readFile(resolve("capacitor.config.ts"), "utf8");
  const { scripts } = JSON.parse(await readFile(resolve("package.json"), "utf8"));
  assert.match(app, /src="\/src\/main\.tsx"/);
  assert.doesNotMatch(app, /landing|beta-form/);
  assert.match(site, /src="\.\.\/src\/landing\/main\.ts"/);
  assert.doesNotMatch(site, /src\/main\.tsx/);
  assert.match(capacitor, /webDir:\s*"dist-app"/);
  assert.match(capacitor, /verifyAppBuild/);
  assert.match(scripts["cap:sync"], /^npm run build:app && cap sync android$/);
  assert.equal(scripts.build, "npm run build:app");
  assert.match(scripts["build:site"], /--mode site/);
});
