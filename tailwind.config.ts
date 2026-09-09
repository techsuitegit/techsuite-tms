import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#1F3864",
        secondary: "#2E75B6",
        accent: "#0D7377",
        success: "#1E6B3C",
        warning: "#C0570A",
        background: "#F8FAFC",
        card: "#FFFFFF",
        sidebar: "#1F3864",
        "sidebar-text": "#FFFFFF",
        "nav-active": "#2E75B6",
      },
    },
  },
  plugins: [],
};

export default config;
