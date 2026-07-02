import { describe, it, expect, vi } from "vitest";
import { createPineconeStore } from "./store";

function fakeDense(over: any = {}) {
  return {
    upsert: vi.fn(async () => ({})),
    query: vi.fn(async () => ({ matches: [] })),
    fetch: vi.fn(async () => ({ records: {} })),
    listPaginated: vi.fn(async () => ({ vectors: [], pagination: undefined })),
    deleteMany: vi.fn(async () => ({})),
    ...over,
  };
}
function fakeSparse(over: any = {}) {
  return {
    upsertRecords: vi.fn(async () => ({})),
    searchRecords: vi.fn(async () => ({ result: { hits: [] } })),
    deleteMany: vi.fn(async () => ({})),
    ...over,
  };
}

describe("pinecone store", () => {
  it("upsertChunks writes dense vectors and sparse text with documentId-prefixed ids", async () => {
    const dense = fakeDense();
    const sparse = fakeSparse();
    await createPineconeStore(dense as any, sparse as any).upsertChunks([
      { documentId: "d1", filename: "f.md", content: "hi", embedding: [0.1, 0.2], contentHash: "h1" },
    ]);
    const denseArg = dense.upsert.mock.calls[0][0];
    expect(denseArg[0].id.startsWith("d1#")).toBe(true);
    expect(denseArg[0].values).toEqual([0.1, 0.2]);
    expect(denseArg[0].metadata).toMatchObject({ documentId: "d1", filename: "f.md", content: "hi", contentHash: "h1" });
    const sparseArg = sparse.upsertRecords.mock.calls[0][0];
    expect(sparseArg[0]._id).toBe(denseArg[0].id);
    expect(sparseArg[0].text).toBe("hi");
  });

  it("upsertChunks with an empty array does not call either index", async () => {
    const dense = fakeDense();
    const sparse = fakeSparse();
    await createPineconeStore(dense as any, sparse as any).upsertChunks([]);
    expect(dense.upsert).not.toHaveBeenCalled();
    expect(sparse.upsertRecords).not.toHaveBeenCalled();
  });

  it("existingHashes lists by prefix then fetches contentHash", async () => {
    const dense = fakeDense({
      listPaginated: vi.fn(async () => ({ vectors: [{ id: "d1#a" }, { id: "d1#b" }], pagination: undefined })),
      fetch: vi.fn(async () => ({ records: { "d1#a": { id: "d1#a", metadata: { contentHash: "h1" } }, "d1#b": { id: "d1#b", metadata: { contentHash: "h2" } } } })),
    });
    const out = await createPineconeStore(dense as any, fakeSparse() as any).existingHashes("d1");
    expect(dense.listPaginated.mock.calls[0][0]).toMatchObject({ prefix: "d1#" });
    expect([...out].sort()).toEqual(["h1", "h2"]);
  });

  it("deleteByDocument lists ids by prefix then deletes from both indexes", async () => {
    const dense = fakeDense({ listPaginated: vi.fn(async () => ({ vectors: [{ id: "d1#a" }], pagination: undefined })) });
    const sparse = fakeSparse();
    await createPineconeStore(dense as any, sparse as any).deleteByDocument("d1");
    expect(dense.deleteMany).toHaveBeenCalledWith(["d1#a"]);
    expect(sparse.deleteMany).toHaveBeenCalledWith(["d1#a"]);
  });

  it("searchVector maps dense matches with native cosine score", async () => {
    const dense = fakeDense({
      query: vi.fn(async () => ({ matches: [{ id: "d1#a", score: 0.91, metadata: { documentId: "d1", filename: "f.md", content: "hi" } }] })),
    });
    const out = await createPineconeStore(dense as any, fakeSparse() as any).searchVector([0.1], 5);
    expect(out).toEqual([{ chunkId: "d1#a", documentId: "d1", filename: "f.md", content: "hi", score: 0.91 }]);
  });

  it("searchKeyword queries sparse, fetches dense vectors, recomputes cosine score", async () => {
    const dense = fakeDense({
      fetch: vi.fn(async () => ({ records: { "d1#a": { id: "d1#a", values: [1, 0], metadata: { documentId: "d1", filename: "f.md", content: "dog" } } } })),
    });
    const sparse = fakeSparse({ searchRecords: vi.fn(async () => ({ result: { hits: [{ _id: "d1#a" }] } })) });
    const store = createPineconeStore(dense as any, sparse as any);
    expect(await store.searchKeyword("a", [1, 0], 5)).toEqual([]); // too short
    const out = await store.searchKeyword("dog", [1, 0], 5);
    expect(sparse.searchRecords).toHaveBeenCalled();
    expect(out[0].chunkId).toBe("d1#a");
    expect(out[0].score).toBeCloseTo(1);
  });
});
