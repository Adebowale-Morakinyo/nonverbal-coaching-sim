import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0c0c10",
        surface: "#16161d",
        "surface-2": "#1e1e27",
        border: "#2a2a35",
        primary: "#6366f1",
        "primary-dim": "#4f46e5",
        success: "#22c55e",
        warning: "#f59e0b",
        danger: "#ef4444",
        text: "#e4e4f0",
        "text-muted": "#8b8b9e",
      },
      borderRadius: {
        card: "12px",
        input: "8px",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      transitionTimingFunction: {
        smooth: "ease",
      },
    },
  },
} satisfies Config;
