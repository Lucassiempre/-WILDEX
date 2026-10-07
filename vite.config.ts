import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { readSupabaseConfig } from "./src/config/supabaseConfig";

export default defineConfig(({ mode }) => {
  const fileEnvironment = loadEnv(mode, process.cwd(), "VITE_");
  readSupabaseConfig({
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? fileEnvironment.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY
      ?? fileEnvironment.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];

  return {
    base: repositoryName ? `/${repositoryName}/` : "./",
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          app: resolve(process.cwd(), "index.html"),
          privacy: resolve(process.cwd(), "privacy/index.html"),
          deleteAccount: resolve(process.cwd(), "delete-account/index.html"),
        },
      },
    },
  };
});
