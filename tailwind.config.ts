import type { Config } from "tailwindcss";

// Every colour resolves through a CSS variable so the two theme blocks in
// globals.css are the single source of truth, and `/50` opacity still works.
const token = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        surface: { DEFAULT: token("surface"), 2: token("surface-2") },
        border: { DEFAULT: token("border"), strong: token("border-strong") },
        ink: { DEFAULT: token("ink"), muted: token("ink-muted"), subtle: token("ink-subtle") },
        shade: token("shade"),
        accent: {
          DEFAULT: token("accent"),
          hover: token("accent-hover"),
          soft: token("accent-soft"),
          ink: token("accent-ink"),
        },
        success: { DEFAULT: token("success"), soft: token("success-soft") },
        warning: { DEFAULT: token("warning"), soft: token("warning-soft") },
        danger: { DEFAULT: token("danger"), soft: token("danger-soft"), ink: token("danger-ink") },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      // The scale is deliberately tighter than Tailwind's default: `text-sm` moves
      // from 14px to 13px, which shifts every existing screen slightly. That is the
      // point of adopting one scale.
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "0.9375rem", letterSpacing: "0.08em" }],
        xs: ["0.75rem", { lineHeight: "1.0625rem" }],
        sm: ["0.8125rem", { lineHeight: "1.1875rem" }],
        md: ["0.875rem", { lineHeight: "1.3125rem" }],
        lg: ["1rem", { lineHeight: "1.625rem" }],
        xl: ["1.25rem", { lineHeight: "1.6875rem" }],
        "2xl": ["1.5625rem", { lineHeight: "1.9375rem" }],
      },
      borderRadius: { sm: "4px", DEFAULT: "6px", lg: "10px" },
      boxShadow: {
        // Only two, and both are named for what floats. Cards inside a page use
        // borders instead.
        raise: "0 1px 2px rgb(var(--c-shade) / 0.08)",
        pop: "0 12px 32px -8px rgb(var(--c-shade) / 0.45), 0 2px 8px rgb(var(--c-shade) / 0.25)",
      },
      transitionTimingFunction: { panel: "cubic-bezier(.2,.8,.2,1)" },
      spacing: { rail: "72px", panel: "260px" },
    },
  },
  plugins: [],
} satisfies Config;
