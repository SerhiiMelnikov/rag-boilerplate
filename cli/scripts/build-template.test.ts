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
});
