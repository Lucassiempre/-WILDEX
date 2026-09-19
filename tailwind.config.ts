import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: "#12372A",
        canopy: "#436850",
        moss: "#ADBC9F",
        paper: "#F8FAF5",
        gold: "#D8A942",
        ember: "#C96633",
        ink: "#1C2420",
      },
      boxShadow: {
        glow: "0 24px 80px rgba(18, 55, 42, 0.18)",
        lift: "0 18px 45px rgba(18, 55, 42, 0.16)",
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-110%)" },
          "100%": { transform: "translateY(210%)" },
        },
        pop: {
          "0%": { transform: "scale(.96)", opacity: "0" },
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
