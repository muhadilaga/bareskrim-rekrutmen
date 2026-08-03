import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        crimson: {
          DEFAULT: "#7B1113",
          50: "#fdf3f3",
          100: "#fbe5e5",
          200: "#f5cfcf",
          300: "#ecaaaa",
          400: "#df7a7b",
          500: "#cf5254",
          600: "#b93a3c",
          700: "#9c2c2e",
          800: "#7B1113",
          900: "#5c0f11",
          950: "#3a0506",
        },
        gold: {
          DEFAULT: "#D4AF37",
          50: "#fbf8eb",
          100: "#f6efd0",
          200: "#eedda0",
          300: "#e5c96c",
          400: "#ddb94a",
          500: "#D4AF37",
          600: "#b08d25",
          700: "#8a6d1d",
          800: "#6b5419",
          900: "#4d3d13",
        },
      },
      fontFamily: {
        display: ["Cinzel", "Georgia", "serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 30px rgba(212, 175, 55, 0.18)",
        "glow-red": "0 0 30px rgba(123, 17, 19, 0.4)",
      },
      backgroundImage: {
        "hero-radial":
          "radial-gradient(1200px 600px at 50% -10%, rgba(212,175,55,0.14), transparent 60%), radial-gradient(1000px 700px at 100% 100%, rgba(123,17,19,0.55), transparent 60%)",
      },
    },
  },
  plugins: [],
};

export default config;
