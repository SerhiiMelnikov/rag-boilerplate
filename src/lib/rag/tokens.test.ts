import { describe, it, expect } from "vitest";
import { estimateTokens } from "@/lib/rag/tokens";

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });
  it("approximates ~1 token per 4 chars", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
  it("grows monotonically with length", () => {
    expect(estimateTokens("a".repeat(800))).toBeGreaterThan(estimateTokens("a".repeat(400)));
  });
});
