import { describe, it, expect } from "vitest";
import { cosineSimilarity } from "./cosine";

describe("cosineSimilarity", () => {
  it("is 1 for identical direction", () => {
    expect(cosineSimilarity([1, 0, 0], [2, 0, 0])).toBeCloseTo(1);
  });
  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("is 0 when either vector is zero-length", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});
