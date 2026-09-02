import { describe, it, expect } from "vitest";
import { chunkText, chunkMarkdown } from "@/lib/rag/chunk";

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

describe("chunkMarkdown", () => {
  it("splits into one chunk per heading section, heading kept with its body", () => {
    const md = "# A\nalpha text\n\n## B\nbeta text";
    const out = chunkMarkdown(md);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("# A");
    expect(out[0]).toContain("alpha text");
    expect(out[1]).toContain("## B");
    expect(out[1]).toContain("beta text");
  });

  it("keeps preamble before the first heading as its own chunk", () => {
    const out = chunkMarkdown("intro line\n\n# H\nbody");
    expect(out[0]).toContain("intro line");
    expect(out[0]).not.toContain("# H");
  });

  it("delegates an oversized section to chunkText", () => {
    const big = "x".repeat(2500);
    const out = chunkMarkdown(`# H\n${big}`, { chunkSize: 1000, overlap: 100 });
    expect(out.length).toBeGreaterThan(1);
    expect(out.length).toBe(chunkText(`# H\n${big}`, { chunkSize: 1000, overlap: 100 }).length);
  });

  it("returns [] for blank input", () => {
    expect(chunkMarkdown("   \n  ")).toEqual([]);
  });
});
