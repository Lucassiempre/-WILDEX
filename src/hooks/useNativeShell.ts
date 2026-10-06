import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { StatusBar, Style } from "@capacitor/status-bar";
import { useEffect, useRef } from "react";

export function useNativeShell(theme: "light" | "dark", onBack: () => boolean) {
  const backHandler = useRef(onBack);
  backHandler.current = onBack;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    document.documentElement.classList.add("native-app");
    let active = true;
    const removers: Array<() => Promise<void>> = [];

    void Promise.all([
      CapacitorApp.addListener("backButton", () => {
        if (!backHandler.current()) void CapacitorApp.minimizeApp();
      }),
      Keyboard.addListener("keyboardWillShow", () => document.documentElement.classList.add("keyboard-open")),
      Keyboard.addListener("keyboardWillHide", () => document.documentElement.classList.remove("keyboard-open")),
    ]).then((handles) => {
      if (!active) {
        handles.forEach((handle) => void handle.remove());
        return;
      }
      handles.forEach((handle) => removers.push(() => handle.remove()));
    });

    void StatusBar.setOverlaysWebView({ overlay: true });

    return () => {
      active = false;
      document.documentElement.classList.remove("native-app", "keyboard-open");
      removers.forEach((remove) => void remove());
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void StatusBar.setStyle({ style: theme === "light" ? Style.Dark : Style.Light });
  }, [theme]);
}
