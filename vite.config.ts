import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readSupabaseConfig } from "./src/config/supabaseConfig";

const projectDirectory = process.cwd();

function verifyBuildTarget(site: boolean): Plugin {
  return {
    name: "wildex-build-target",
    apply: "build",
    async generateBundle(_options, bundle) {
      const modules = Object.values(bundle).flatMap((output) =>
        output.type === "chunk" ? Object.keys(output.modules) : [],
      ).map((id) => id.replaceAll("\\", "/").split("?")[0]);
      const hasAppEntry = modules.some((id) => id.endsWith("/src/main.tsx"));
      const hasLandingEntry = modules.some((id) => id.endsWith("/src/landing/main.ts"));
      if (site ? hasAppEntry || !hasLandingEntry : !hasAppEntry || hasLandingEntry) {
        this.error("El build mezcla la app Wildex con el sitio publico.");
      }
      if (!site) {
        for (const file of ["wildex-icon.png", "wildex-logo.png"]) {
          this.emitFile({
            type: "asset",
            fileName: `images/${file}`,
            source: await readFile(resolve(projectDirectory, "public/images", file)),
          });
        }
        this.emitFile({
          type: "asset",
          fileName: "wildex-build.json",
          source: JSON.stringify({ target: "app", entry: "src/main.tsx" }),
        });
      }
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const site = mode === "site";
  const fileEnvironment = loadEnv(mode, projectDirectory, "VITE_");
  readSupabaseConfig({
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? fileEnvironment.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY
      ?? fileEnvironment.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];

  const input: Record<string, string> = site ? {
    landing: resolve(projectDirectory, "site/index.html"),
    privacy: resolve(projectDirectory, "site/privacy/index.html"),
    deleteAccount: resolve(projectDirectory, "site/delete-account/index.html"),
  } : {
    app: resolve(projectDirectory, "index.html"),
  };

  return {
    root: site ? resolve(projectDirectory, "site") : projectDirectory,
    envDir: projectDirectory,
    base: site && repositoryName ? `/${repositoryName}/` : "./",
    publicDir: site || command === "serve" ? resolve(projectDirectory, "public") : false,
    plugins: [react(), verifyBuildTarget(site)],
    build: {
      outDir: resolve(projectDirectory, site ? "dist-site" : "dist-app"),
      emptyOutDir: true,
      rollupOptions: {
        input,
      },
    },
  };
});
