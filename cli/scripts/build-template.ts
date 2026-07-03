import { cp, rm, rename, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

// Assemble cli/template/ from the app root, excluding dev-only scaffolding.
const ROOT = resolve(import.meta.dirname, "..", "..");
const OUT = resolve(import.meta.dirname, "..", "template");
const EXCLUDE = new Set(["cli", "docs", ".superpowers", "node_modules", ".next", ".git", "tsconfig.tsbuildinfo", ".env", "package-lock.json", "next-env.d.ts"]);
// The template is a clean starting point; the boilerplate's own tests (and the
// vitest configs that run them) are not shipped. This also matters functionally:
// scaffold() prunes unselected provider adapters and vector-store dirs, and the
// boilerplate's test files import across those modules (e.g. adapters.test.ts
// imports every provider, ingest.integration.test.ts imports pgvector), so
// shipping them would break `tsc`/`next build`/`npm test` in the generated app.
const TEST_FILE_RE = /\.test\.tsx?$/;
const EXCLUDE_BASENAMES = new Set(["vitest.config.ts", "vitest.integration.config.ts", "vitest.setup.ts"]);

async function main() {
  if (existsSync(OUT)) await rm(OUT, { recursive: true, force: true });

  // Node's fs.cp refuses to copy a directory into any of its own subdirectories
  // (checked before the filter callback runs), and OUT (cli/template) sits under
  // ROOT. So stage the filtered copy outside ROOT first, then move it into place.
  const staging = await mkdtemp(join(tmpdir(), "rag-template-"));
  try {
    await cp(ROOT, staging, {
      recursive: true,
      filter: (src) => {
        const rel = src.slice(ROOT.length + 1);
        const top = rel.split("/")[0];
        if (rel === "") return true;
        if (EXCLUDE.has(top)) return false;
        if (rel.endsWith(".tsbuildinfo")) return false;
        const base = basename(src);
        if (TEST_FILE_RE.test(base)) return false;
        if (EXCLUDE_BASENAMES.has(base)) return false;
        return true;
      },
    });
    await cp(staging, OUT, { recursive: true });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  // Store .gitignore as _gitignore (npm would strip a real .gitignore from the package).
  const gi = join(OUT, ".gitignore");
  if (existsSync(gi)) await rename(gi, join(OUT, "_gitignore"));
  console.log("template assembled at", OUT);
}
main();
