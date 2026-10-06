import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.mrlabs.wildex",
  appName: "WILDEX",
  webDir: "dist",
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
