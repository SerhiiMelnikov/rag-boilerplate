import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite eagerly resolves a PostCSS config at startup regardless of whether any
  // test touches CSS, searching upward from cli/ through parent directories.
  // Without this, it finds the app root's postcss.config.mjs (which requires
  // tailwindcss) and crashes when cli/'s own install has no root node_modules
  // to resolve that package from - exactly the case on a CI runner that only
  // runs `npm ci` inside cli/. Inline (empty) postcss options skip that search.
  css: { postcss: { plugins: [] } },
  test: { environment: "node", include: ["src/**/*.test.ts", "scripts/**/*.test.ts"] },
});
