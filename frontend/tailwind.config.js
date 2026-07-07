import forms from '@tailwindcss/forms';
import containerQueries from '@tailwindcss/container-queries';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        slate: {
          800: "#1c1c1e",
          850: "#111111",
          900: "#0c0c0c",
          950: "#000000"
        },
        "primary-container": "#003366",
        "surface-container-high": "#e7e8e9",
        "tertiary": "#381300",
        "surface-bright": "#f8f9fa",
        "on-secondary-fixed-variant": "#38485d",
        "inverse-surface": "#2e3132",
        "on-error": "#ffffff",
        "on-primary-fixed": "#001b3c",
        "on-surface": "#191c1d",
        "surface-container-low": "#f3f4f5",
        "tertiary-fixed": "#ffdbca",
        "background": "#f8f9fa",
        "on-primary": "#ffffff",
        "tertiary-fixed-dim": "#ffb690",
        "surface-container-highest": "#e1e3e4",
        "surface-tint": "#3a5f94",
        "inverse-primary": "#a7c8ff",
        "on-tertiary-fixed-variant": "#723610",
        "outline-variant": "#c3c6d1",
        "on-surface-variant": "#43474f",
        "outline": "#737780",
        "secondary": "#505f76",
        "secondary-fixed-dim": "#b7c8e1",
        "on-tertiary-container": "#d8885c",
        "on-tertiary": "#ffffff",
        "on-secondary": "#ffffff",
        "primary-fixed-dim": "#a7c8ff",
        "secondary-container": "#d0e1fb",
        "primary-fixed": "#d5e3ff",
        "secondary-fixed": "#d3e4fe",
        "surface-container": "#edeeef",
        "on-primary-fixed-variant": "#1f477b",
        "on-secondary-fixed": "#0b1c30",
        "inverse-on-surface": "#f0f1f2",
        "surface-container-lowest": "#ffffff",
        "error-container": "#ffdad6",
        "on-secondary-container": "#54647a",
        "on-background": "#191c1d",
        "on-primary-container": "#799dd6",
        "on-error-container": "#93000a",
        "primary": "#001e40",
        "surface-dim": "#d9dadb",
        "error": "#ba1a1a",
        "tertiary-container": "#592300",
        "on-tertiary-fixed": "#341100",
        "surface": "#f8f9fa",
        "surface-variant": "#e1e3e4"
      },
      borderRadius: {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      }
    },
  },
  plugins: [
    forms,
    containerQueries,
  ],
}
