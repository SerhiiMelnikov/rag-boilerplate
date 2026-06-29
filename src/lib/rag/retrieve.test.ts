import { describe, it, expect } from "vitest";
import { trimToBudget, filterByThreshold, searchChunks, type RetrievedChunk } from "@/lib/rag/retrieve";

const mk = (id: string, score: number, content: string): RetrievedChunk => ({
  chunkId: id, documentId: "d", filename: "f.md", content, score,
});

describe("filterByThreshold", () => {
  it("drops chunks below minSimilarity", () => {
    const out = filterByThreshold([mk("a", 0.9, "x"), mk("b", 0.1, "y")], 0.5);
    expect(out.map((c) => c.chunkId)).toEqual(["a"]);
  });
});

describe("trimToBudget", () => {
  it("keeps chunks until the token budget is exceeded", () => {
    // each content is 400 chars => ~100 tokens
    const chunks = [mk("a", 0.9, "a".repeat(400)), mk("b", 0.8, "b".repeat(400)), mk("c", 0.7, "c".repeat(400))];
    const out = trimToBudget(chunks, 250); // fits 2 (200 tokens), not 3 (300)
    expect(out.map((c) => c.chunkId)).toEqual(["a", "b"]);
  });

  it("always keeps at least the top chunk even if over budget", () => {
    const out = trimToBudget([mk("a", 0.9, "a".repeat(4000))], 10);
    expect(out.map((c) => c.chunkId)).toEqual(["a"]);
  });
});

describe("searchChunks (hybrid)", () => {
  const opts = { topK: 5, minSimilarity: 0.5, tokenBudget: 10000 };

  it("gates vector-only results by the similarity threshold", async () => {
    const vectorRun = async () => [mk("a", 0.9, "a"), mk("b", 0.8, "b"), mk("c", 0.2, "c")];
    const keywordRun = async () => [];
    const out = await searchChunks("q", [0.1], opts, { vectorRun, keywordRun });
    expect(out.map((c) => c.chunkId)).toEqual(["a", "b"]); // "c" dropped (0.2 < 0.5)
  });

  it("keeps keyword matches even when their cosine score is below the threshold", async () => {
    // "k" has low cosine (0.1) but is a keyword hit -> must survive the gate.
    const vectorRun = async () => [mk("a", 0.9, "a")];
    const keywordRun = async () => [mk("k", 0.1, "k")];
    const out = await searchChunks("brother", [0.1], opts, { vectorRun, keywordRun });
    expect(out.map((c) => c.chunkId).sort()).toEqual(["a", "k"]);
  });

  it("fuses ranks so a chunk found by both retrievers ranks first", async () => {
    const vectorRun = async () => [mk("x", 0.6, "x"), mk("a", 0.9, "a")];
    const keywordRun = async () => [mk("a", 0.9, "a"), mk("y", 0.55, "y")];
    const out = await searchChunks("q", [0.1], opts, { vectorRun, keywordRun });
    expect(out[0].chunkId).toBe("a"); // appears in both lists -> highest RRF
  });

  it("respects the token budget in fused-rank order", async () => {
    const vectorRun = async () => [mk("a", 0.9, "a".repeat(400)), mk("b", 0.8, "b".repeat(400)), mk("c", 0.7, "c".repeat(400))];
    const keywordRun = async () => [];
    const out = await searchChunks("q", [0.1], { topK: 5, minSimilarity: 0.5, tokenBudget: 250 }, { vectorRun, keywordRun });
    expect(out.map((c) => c.chunkId)).toEqual(["a", "b"]); // ~100 tokens each, 3rd exceeds 250
  });
});
