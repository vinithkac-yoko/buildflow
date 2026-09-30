import type { Config } from "tailwindcss";

const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: c("bg"),
        surface: c("surface"),
        "surface-2": c("surface-2"),
        border: "var(--border)",
        text: c("text"),
        muted: c("text-muted"),
        brand: { DEFAULT: c("brand"), on: c("on-brand"), text: c("brand-text") },
        planned: c("planned"),
        warn: c("warn"),
        danger: c("danger"),
        slate: c("slate"),
      },
      fontFamily: {
        sans: ['"Fira Sans"', "system-ui", "sans-serif"],
        mono: ['"Fira Code"', "ui-monospace", "monospace"],
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.125rem" },
      transitionDuration: { fast: "150ms", base: "200ms" },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "bar-grow": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
        "pulse-dot": {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(0.8)" },
        },
      },
      animation: {
        "fade-up": "fade-up 220ms ease-out both",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        "bar-grow": "bar-grow 320ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
