import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "rgb(var(--color-base) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        card: "rgb(var(--color-card) / <alpha-value>)",
        soft: "rgb(var(--color-soft) / <alpha-value>)",
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        secondary: "rgb(var(--color-secondary) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        "accent-secondary": "rgb(var(--color-accent-secondary) / <alpha-value>)",
        "on-accent": "rgb(var(--color-on-accent) / <alpha-value>)",
        gold: "rgb(var(--color-gold) / <alpha-value>)",
        danger: "rgb(var(--color-danger) / <alpha-value>)",
        "brand-deep": "#081610",
        "brand-cream": "#F5F4EA",
        "brand-leaf": "#A5D66D",
      },
      boxShadow: {
        phone: "0 28px 80px rgba(0, 0, 0, 0.24)",
        panel: "0 6px 24px rgba(8, 22, 16, 0.06)",
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-110%)" },
          "100%": { transform: "translateY(210%)" },
        },
        pop: {
          "0%": { transform: "scale(.97) translateY(6px)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        scan: "scan 1.6s ease-in-out infinite",
        pop: "pop .22s ease-out both",
      },
    },
  },
  plugins: [],
} satisfies Config;
