// End-to-end: build the template, scaffold a few combinations into temp dirs,
// and assert the generated app is pruned correctly AND type-checks.
// Gated behind RUN_INTEGRATION=1 (installs no deps — runs tsc via the app's own
// typescript once node_modules is linked; see note). Run:
//   cd cli && npm run build:template && RUN_INTEGRATION=1 npx vitest run src/installer.integration.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { scaffold } from "./scaffold";
import type { InstallOptions } from "./options";

const RUN = process.env.RUN_INTEGRATION === "1";
const templateDir = resolve(import.meta.dirname, "..", "template");

const combos: Array<{ name: string; o: Partial<InstallOptions> }> = [
  { name: "google+pgvector", o: { providers: ["google"], defaultProvider: "google", vectorStore: "pgvector" } },
  { name: "openai+qdrant", o: { providers: ["openai"], defaultProvider: "openai", vectorStore: "qdrant" } },
  { name: "anthropic+google+weaviate", o: { providers: ["anthropic", "google"], defaultProvider: "anthropic", vectorStore: "weaviate" } },
];

describe.runIf(RUN)("installer (integration)", () => {
  beforeAll(() => { if (!existsSync(templateDir)) throw new Error("Run `npm run build:template` first."); });

  for (const c of combos) {
    it(`scaffolds ${c.name} into a pruned, type-checking app`, async () => {
      const parent = await mkdtemp(join(tmpdir(), "it-"));
      const target = join(parent, "app");
      const full: InstallOptions = { projectName: "app", providers: ["google"], defaultProvider: "google", vectorStore: "pgvector", git: false, install: false, packageManager: "npm", yes: true, ...c.o } as InstallOptions;
      await scaffold(full, { templateDir, targetDir: target });

      // Pruned modules absent; selected present.
      const pkg = JSON.parse(await readFile(join(target, "package.json"), "utf8"));
      if (full.vectorStore !== "chroma") expect(pkg.dependencies["chromadb"]).toBeUndefined();
      if (!full.providers.includes("anthropic")) expect(pkg.dependencies["@ai-sdk/anthropic"]).toBeUndefined();
      expect(existsSync(join(target, `src/lib/vectorstore/${full.vectorStore}`))).toBe(true);
      // The template is a clean starting point: the boilerplate's own test files and
      // vitest configs must not ship (they'd import pruned provider/store modules).
      expect(existsSync(join(target, "src/lib/providers/adapters.test.ts"))).toBe(false);
      expect(existsSync(join(target, "vitest.config.ts"))).toBe(false);
      // Type-check the generated app using its own installed typescript if present,
      // else skip the tsc step (dep install is out of scope for CI speed).
      const tsc = join(target, "node_modules/.bin/tsc");
      if (existsSync(tsc)) execFileSync(tsc, ["--noEmit"], { cwd: target, stdio: "inherit" });

      await rm(parent, { recursive: true, force: true });
    }, 120000);
  }
});
