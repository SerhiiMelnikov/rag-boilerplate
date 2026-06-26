import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/rag/chunk";

describe("chunkText", () => {
  it("returns one chunk when text is shorter than chunkSize", () => {
    expect(chunkText("short text", { chunkSize: 100 })).toEqual(["short text"]);
  });

  it("splits long text into multiple chunks", () => {
    const text = "a".repeat(2500);
    const chunks = chunkText(text, { chunkSize: 1000, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.length <= 1000)).toBe(true);
  });

  it("overlaps consecutive chunks", () => {
    const text = "abcdefghij".repeat(200); // 2000 chars
    const chunks = chunkText(text, { chunkSize: 1000, overlap: 100 });
    const tail = chunks[0].slice(-100);
    expect(chunks[1].startsWith(tail)).toBe(true);
  });

  it("ignores empty/whitespace-only input", () => {
    expect(chunkText("   \n  ")).toEqual([]);
  });
});
