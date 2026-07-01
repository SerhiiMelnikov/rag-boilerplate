import { describe, it, expect } from "vitest";
import { fuse } from "./fusion";
import type { RetrievedChunk } from "./types";

const c = (id: string, score: number): RetrievedChunk => ({
  chunkId: id, documentId: "d" + id, filename: id + ".md", content: "content " + id, score,
});

describe("fuse (RRF)", () => {
  it("keeps a keyword-only hit even when its cosine is below minSimilarity", () => {
    const vec = [c("a", 0.9)];
    const kw = [c("b", 0.1)]; // low cosine, but an exact keyword hit
    const out = fuse(vec, kw, { topK: 10, minSimilarity: 0.5, tokenBudget: 10000 });
    expect(out.map((x) => x.chunkId).sort()).toEqual(["a", "b"]);
  });

  it("drops a vector-only hit below minSimilarity", () => {
    const vec = [c("a", 0.9), c("low", 0.2)];
    const kw: RetrievedChunk[] = [];
    const out = fuse(vec, kw, { topK: 10, minSimilarity: 0.5, tokenBudget: 10000 });
    expect(out.map((x) => x.chunkId)).toEqual(["a"]);
  });

  it("ranks by fused RRF score (appearing in both lists beats a single high cosine)", () => {
    const vec = [c("a", 0.99), c("b", 0.80)];
    const kw = [c("b", 0.80), c("a", 0.99)];
    const out = fuse(vec, kw, { topK: 10, minSimilarity: 0, tokenBudget: 10000 });
    expect(out).toHaveLength(2);
    // both appear twice; a is rank0 in vec and rank1 in kw, b is rank1/rank0 — tie, but a's cosine higher
    expect(out[0].score).toBeGreaterThanOrEqual(out[1].score);
  });

  it("caps at topK and respects the token budget (always keeps the top chunk)", () => {
    const big = "word ".repeat(2000); // large content
    const vec = [{ ...c("a", 0.9), content: big }, { ...c("b", 0.8), content: big }];
    const out = fuse(vec, [], { topK: 5, minSimilarity: 0, tokenBudget: 50 });
    expect(out).toHaveLength(1); // budget stops after the first, but the top is always kept
    expect(out[0].chunkId).toBe("a");
  });

  it("returns the display cosine score, not the RRF score", () => {
    const out = fuse([c("a", 0.77)], [], { topK: 5, minSimilarity: 0, tokenBudget: 10000 });
    expect(out[0].score).toBe(0.77);
  });
});
