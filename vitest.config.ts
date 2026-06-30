import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    env: {
      DATABASE_URL: "postgres://stub:stub@localhost:5432/stub",
      AUTH_SECRET: "test-secret-stub-for-vitest-do-not-use-in-production",
      SETTINGS_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    },
    // Force next-auth (and its deps) through Vite's transform pipeline so that
    // resolve.alias entries (including "next/server") are applied to imports
    // inside node_modules.
    server: {
      deps: {
        inline: ["next-auth", "@auth/core"],
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // next-auth ESM code uses the bare specifier "next/server"; map it to the
      // CJS shim that Next.js ships so Vitest can resolve it.
      "next/server": fileURLToPath(new URL("./node_modules/next/server.js", import.meta.url)),
    },
  },
});
