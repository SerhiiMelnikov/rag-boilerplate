// Separate vitest config for integration tests.
// Does NOT stub DATABASE_URL so the real DB connection from the environment is used.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: { environment: "node", globals: true },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
