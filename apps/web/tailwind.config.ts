import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Bang mau DeliverTrust — xem chu thich trong src/app/globals.css.
        dt: {
          bg: "var(--dt-bg)",
          side: "var(--dt-side)",
          panel: "var(--dt-panel)",
          panel2: "var(--dt-panel-2)",
          border: "var(--dt-border)",
          yellow: "var(--dt-yellow)",
          text: "var(--dt-text)",
          muted: "var(--dt-muted)",
          green: "var(--dt-green)",
          red: "var(--dt-red)",
        },
      },
      borderRadius: {
        dt: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
