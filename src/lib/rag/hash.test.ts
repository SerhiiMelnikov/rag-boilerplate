import { describe, it, expect } from "vitest";
import { hashContent } from "@/lib/rag/hash";

describe("hashContent", () => {
  it("is deterministic", () => {
    expect(hashContent("hello")).toBe(hashContent("hello"));
  });
  it("differs for different input", () => {
    expect(hashContent("a")).not.toBe(hashContent("b"));
  });
  it("returns a 64-char hex string", () => {
    expect(hashContent("x")).toMatch(/^[0-9a-f]{64}$/);
  });
});
