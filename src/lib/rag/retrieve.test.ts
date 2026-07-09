import { describe, it, expect, vi } from "vitest";
import { searchChunks } from "./retrieve";
import type { RetrievedChunk, VectorStore } from "@/lib/vectorstore/types";

const c = (id: string, score: number): RetrievedChunk => ({
  chunkId: id, documentId: "d" + id, filename: id + ".md", content: "content " + id, score,
});

function fakeStore(vec: RetrievedChunk[], kw: RetrievedChunk[]): VectorStore {
  return {
    upsertChunks: vi.fn(), existingHashes: vi.fn(), deleteByDocument: vi.fn(),
    searchVector: vi.fn(async () => vec),
    searchKeyword: vi.fn(async () => kw),
  };
}

describe("searchChunks", () => {
  it("queries both primitives and fuses the results", async () => {
    const store = fakeStore([c("a", 0.9)], [c("b", 0.2)]);
    const out = await searchChunks("hello world", [0.1, 0.2], { topK: 10, minSimilarity: 0.5, tokenBudget: 10000 }, { store });
    // keyword hit b is kept despite low cosine; vector hit a kept.
    expect(out.map((x) => x.chunkId).sort()).toEqual(["a", "b"]);
    expect(store.searchVector).toHaveBeenCalled();
    expect(store.searchKeyword).toHaveBeenCalledWith("hello world", [0.1, 0.2], expect.any(Number), undefined);
  });

  it("forwards allowedDocumentIds to both store searches", async () => {
    const searchVector = vi.fn(async () => []);
    const searchKeyword = vi.fn(async () => []);
    const store = { searchVector, searchKeyword } as any;
    await searchChunks("hello world", [0.1, 0.2], { topK: 10, minSimilarity: 0.5, tokenBudget: 10000, allowedDocumentIds: ["d1", "d2"] }, { store });
    expect(searchVector).toHaveBeenCalledWith([0.1, 0.2], expect.any(Number), ["d1", "d2"]);
    expect(searchKeyword).toHaveBeenCalledWith("hello world", [0.1, 0.2], expect.any(Number), ["d1", "d2"]);
  });
});
