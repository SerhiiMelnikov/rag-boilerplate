import { describe, it, expect } from "vitest";
import { EMBEDDING_DIMENSIONS, assertEmbeddingDimension } from "./embedding";

describe("assertEmbeddingDimension", () => {
  it("defaults the target to 768", () => {
    expect(EMBEDDING_DIMENSIONS).toBe(768);
  });

  it("returns the vector when its length matches the target", () => {
    const v = new Array(EMBEDDING_DIMENSIONS).fill(0.1);
    expect(assertEmbeddingDimension(v)).toBe(v);
  });

  it("throws a clear error on a length mismatch", () => {
    const v = new Array(EMBEDDING_DIMENSIONS - 1).fill(0);
    expect(() => assertEmbeddingDimension(v)).toThrow(new RegExp(`returned ${EMBEDDING_DIMENSIONS - 1} dimensions, expected ${EMBEDDING_DIMENSIONS}`));
  });
});
