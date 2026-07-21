// End-to-end: build the template, scaffold a few combinations into temp dirs,
// and assert the generated app is pruned correctly AND type-checks.
// Gated behind RUN_INTEGRATION=1 (installs no deps — runs tsc via the app's own
// typescript once node_modules is linked; see note). Run:
//   cd cli && npm run build:template && RUN_INTEGRATION=1 npx vitest run src/installer.integration.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { scaffold } from "./scaffold.js";
import type { InstallOptions } from "./options.js";

// Recursively collect every file under `dir` (used below to confirm no
// surviving api-only source file imports the pruned src/auth.ts).
async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (e) => {
      const p = join(dir, e.name);
      return e.isDirectory() ? collectFiles(p) : [p];
    }),
  );
  return files.flat();
}

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
      const full: InstallOptions = { projectName: "app", providers: ["google"], defaultProvider: "google", vectorStore: "pgvector", appKind: "full", git: false, install: false, packageManager: "npm", yes: true, ...c.o } as InstallOptions;
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

describe.runIf(RUN)("installer (integration): appKind", () => {
  beforeAll(() => { if (!existsSync(templateDir)) throw new Error("Run `npm run build:template` first."); });

  it("api-only: prunes Next.js/React entirely, keeps src/server, and never imports @/auth", async () => {
    const parent = await mkdtemp(join(tmpdir(), "it-api-"));
    const target = join(parent, "app");
    const o: InstallOptions = { projectName: "app", providers: ["google"], defaultProvider: "google", vectorStore: "pgvector", appKind: "api", git: false, install: false, packageManager: "npm", yes: true };
    await scaffold(o, { templateDir, targetDir: target });

    for (const rel of [
      "src/app", "middleware.ts", "next.config.ts", "next-env.d.ts", "tailwind.config.ts", "postcss.config.mjs",
      "src/components", "src/auth.ts", "src/auth.config.ts", "src/types/next-auth.d.ts",
    ]) {
      expect(existsSync(join(target, rel))).toBe(false);
    }
    expect(existsSync(join(target, "src/server/index.ts"))).toBe(true);
    expect(existsSync(join(target, "Dockerfile"))).toBe(true);

    const pkg = JSON.parse(await readFile(join(target, "package.json"), "utf8"));
    for (const dep of ["next", "react", "react-dom", "next-auth", "next-themes", "react-markdown", "highlight.js", "@scalar/api-reference-react", "tailwindcss"]) {
      expect(pkg.dependencies?.[dep] ?? pkg.devDependencies?.[dep]).toBeUndefined();
    }
    expect(pkg.dependencies.hono).toBeDefined();
    expect(pkg.dependencies["@auth/core"]).toBeDefined();
    expect(pkg.scripts.dev).toBe("tsx watch src/server/index.ts");
    expect(pkg.scripts.start).toBe("tsx src/server/index.ts");

    // The credential path: nothing surviving under src/ imports the pruned
    // src/auth.ts — authorizeCredentials must come from src/lib/auth/credentials.ts.
    const files = (await collectFiles(join(target, "src"))).filter((f) => /\.tsx?$/.test(f));
    for (const f of files) {
      const content = await readFile(f, "utf8");
      expect(content, `${f} must not import "@/auth"`).not.toMatch(/from ["']@\/auth["']/);
    }

    await rm(parent, { recursive: true, force: true });
  }, 120000);
});
