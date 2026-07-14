import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { EXCLUDE } from "./build-template.js";

describe("template EXCLUDE", () => {
  // This repo's own CI is a matrix over cli/ and all five vector stores. It is
  // meaningless inside a user's generated app, and the template builder copies
  // every top-level entry it is not told to skip.
  it("does not ship this repo's CI workflows", () => {
    expect(EXCLUDE.has(".github")).toBe(true);
  });

  it("still excludes the dev-only scaffolding", () => {
    for (const entry of ["cli", "docs", "node_modules", ".git", ".env"]) {
      expect(EXCLUDE.has(entry)).toBe(true);
    }
  });

  // graphify-out/ is ~2.8MB of generated knowledge-graph scratch output. It was
  // gitignored (chore: ignore graphify-out/) without a matching EXCLUDE entry,
  // which would have shipped it inside every `npm publish` tarball and into
  // every scaffolded project. Locking it in directly, on top of the general
  // sync check below, so this specific regression is unambiguous in a failure.
  it("does not ship generated knowledge-graph artifacts", () => {
    expect(EXCLUDE.has("graphify-out")).toBe(true);
  });
});

describe("template EXCLUDE stays in sync with .gitignore", () => {
  // Directories that are gitignored in the dev repo but are deliberately NOT
  // required to be in EXCLUDE, with the reason. Empty right now — keep it that
  // way unless there is a real, documented reason a gitignored top-level
  // directory should still be copied into the published template.
  const ALLOWED_GITIGNORE_DRIFT = new Set<string>([]);

  // EXCLUDE is a hand-maintained list that must track .gitignore's top-level
  // directories, and nothing else enforces that — graphify-out/ drifted out of
  // sync once already (see the test above). This parses .gitignore itself so a
  // future addition (gitignored but not excluded) fails here instead of
  // shipping in the npm tarball.
  it("includes every top-level gitignored directory", () => {
    const gitignorePath = resolve(import.meta.dirname, "..", "..", ".gitignore");
    const lines = readFileSync(gitignorePath, "utf8").split("\n");

    const topLevelDirs: string[] = [];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line === "" || line.startsWith("#") || line.startsWith("!")) continue; // blank, comment, negation
      if (!line.endsWith("/")) continue; // only plain directory entries, not files or globs
      const dirName = line.slice(0, -1);
      if (dirName.includes("/")) continue; // nested path (e.g. "docs/superpowers"), not top-level
      if (/[*?[\]]/.test(dirName)) continue; // glob pattern, not a plain name
      topLevelDirs.push(dirName);
    }

    // Sanity check on the parser itself: if .gitignore stops containing any
    // plain top-level directory line, this test would vacuously pass.
    expect(topLevelDirs.length).toBeGreaterThan(0);

    for (const dirName of topLevelDirs) {
      if (ALLOWED_GITIGNORE_DRIFT.has(dirName)) continue;
      expect(EXCLUDE.has(dirName)).toBe(true);
    }
  });
});
