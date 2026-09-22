import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const themeKey = "wildex-theme";
const mediaQuery = "(prefers-color-scheme: dark)";

function systemTheme(): Theme {
  return window.matchMedia(mediaQuery).matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia(mediaQuery);
    const handleChange = () => {
      try {
        if (localStorage.getItem(themeKey)) return;
      } catch {
        // The system theme remains usable if storage is unavailable.
      }
      setTheme(systemTheme());
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(themeKey, next);
    } catch {
      // A blocked storage API should not prevent the current theme change.
    }
    setTheme(next);
  };

  return { theme, toggleTheme };
}
