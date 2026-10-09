import type { CapacitorConfig } from "@capacitor/cli";
import { resolve } from "node:path";
import { verifyAppBuild } from "./scripts/verify-app-build.cjs";

if (process.argv.some((argument) => argument === "sync" || argument === "copy")) {
  verifyAppBuild(resolve(process.cwd(), "dist-app"));
}

const config: CapacitorConfig = {
  appId: "com.mrlabs.wildex",
  appName: "WILDEX",
  webDir: "dist-app",
  android: {
    backgroundColor: "#081610",
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
    },
    Keyboard: {
      resizeOnFullScreen: true,
    },
  },
};

export default config;
