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

describe("searchChunks", () => {
  it("runs query, filters by threshold, then trims to budget", async () => {
    const run = async () => [
      mk("a", 0.9, "a".repeat(400)),
      mk("b", 0.8, "b".repeat(400)),
      mk("c", 0.2, "c".repeat(400)), // below threshold
    ];
    const out = await searchChunks([0.1, 0.2], { topK: 5, minSimilarity: 0.5, tokenBudget: 250 }, { run });
    expect(out.map((c) => c.chunkId)).toEqual(["a", "b"]);
  });
});
