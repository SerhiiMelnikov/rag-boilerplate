import { describe, it, expect, vi } from "vitest";
import { createPineconeStore, type PineconeDenseLike, type PineconeSparseLike } from "./store";

// PineconeDenseLike/PineconeSparseLike are the store's own narrow seam (see
// store.ts), kept local precisely so fakes like these don't need the full
// Pinecone SDK types. No return-type annotation here (and `over` is generic,
// not `Partial<...>`): either would contextually widen each vi.fn() back down
// to a plain function, erasing the Mock type the assertions rely on below.
function fakeDense<T extends Partial<PineconeDenseLike> = Record<string, never>>(over: T = {} as never) {
  return {
    upsert: vi.fn(async (_records: Parameters<PineconeDenseLike["upsert"]>[0]) => ({})),
    query: vi.fn(async (_args: Parameters<PineconeDenseLike["query"]>[0]) => ({ matches: [] })),
    fetch: vi.fn(async (_ids: Parameters<PineconeDenseLike["fetch"]>[0]) => ({ records: {} })),
    listPaginated: vi.fn(async (_args: Parameters<PineconeDenseLike["listPaginated"]>[0]) => ({ vectors: [], pagination: undefined })),
    deleteMany: vi.fn(async (_ids: Parameters<PineconeDenseLike["deleteMany"]>[0]) => ({})),
    ...over,
  };
}
function fakeSparse<T extends Partial<PineconeSparseLike> = Record<string, never>>(over: T = {} as never) {
  return {
    upsertRecords: vi.fn(async (_records: Parameters<PineconeSparseLike["upsertRecords"]>[0]) => ({})),
    searchRecords: vi.fn(async (_args: Parameters<PineconeSparseLike["searchRecords"]>[0]) => ({ result: { hits: [] } })),
    deleteMany: vi.fn(async (_ids: Parameters<PineconeSparseLike["deleteMany"]>[0]) => ({})),
    ...over,
  };
}

describe("pinecone store", () => {
  it("upsertChunks writes dense vectors and sparse text with documentId-prefixed ids", async () => {
    const dense = fakeDense();
    const sparse = fakeSparse();
    await createPineconeStore(() => dense, () => sparse).upsertChunks([
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
    await createPineconeStore(() => dense, () => sparse).upsertChunks([]);
    expect(dense.upsert).not.toHaveBeenCalled();
    expect(sparse.upsertRecords).not.toHaveBeenCalled();
  });

  it("existingHashes lists by prefix then fetches contentHash", async () => {
    const dense = fakeDense({
      listPaginated: vi.fn(async () => ({ vectors: [{ id: "d1#a" }, { id: "d1#b" }], pagination: undefined })),
      fetch: vi.fn(async () => ({ records: { "d1#a": { id: "d1#a", metadata: { contentHash: "h1" } }, "d1#b": { id: "d1#b", metadata: { contentHash: "h2" } } } })),
    });
    const out = await createPineconeStore(() => dense, () => fakeSparse()).existingHashes("d1");
    expect(dense.listPaginated.mock.calls[0][0]).toMatchObject({ prefix: "d1#" });
    expect([...out].sort()).toEqual(["h1", "h2"]);
  });

  it("deleteByDocument lists ids by prefix then deletes from both indexes", async () => {
    const dense = fakeDense({ listPaginated: vi.fn(async () => ({ vectors: [{ id: "d1#a" }], pagination: undefined })) });
    const sparse = fakeSparse();
    await createPineconeStore(() => dense, () => sparse).deleteByDocument("d1");
    expect(dense.deleteMany).toHaveBeenCalledWith(["d1#a"]);
    expect(sparse.deleteMany).toHaveBeenCalledWith(["d1#a"]);
  });

  it("searchVector maps dense matches with native cosine score", async () => {
    const dense = fakeDense({
      query: vi.fn(async () => ({ matches: [{ id: "d1#a", score: 0.91, metadata: { documentId: "d1", filename: "f.md", content: "hi" } }] })),
    });
    const out = await createPineconeStore(() => dense, () => fakeSparse()).searchVector([0.1], 5);
    expect(out).toEqual([{ chunkId: "d1#a", documentId: "d1", filename: "f.md", content: "hi", score: 0.91 }]);
  });

  it("searchKeyword queries sparse, fetches dense vectors, recomputes cosine score", async () => {
    const dense = fakeDense({
      fetch: vi.fn(async () => ({ records: { "d1#a": { id: "d1#a", values: [1, 0], metadata: { documentId: "d1", filename: "f.md", content: "dog" } } } })),
    });
    const sparse = fakeSparse({ searchRecords: vi.fn(async () => ({ result: { hits: [{ _id: "d1#a" }] } })) });
    const store = createPineconeStore(() => dense, () => sparse);
    expect(await store.searchKeyword("a", [1, 0], 5)).toEqual([]); // too short
    const out = await store.searchKeyword("dog", [1, 0], 5);
    expect(sparse.searchRecords).toHaveBeenCalled();
    expect(out[0].chunkId).toBe("d1#a");
    expect(out[0].score).toBeCloseTo(1);
  });

  it("searchVector passes a $in documentId filter to the dense query", async () => {
    const dense = fakeDense();
    await createPineconeStore(() => dense, () => fakeSparse()).searchVector([0.1], 5, ["d1", "d2"]);
    expect(dense.query.mock.calls[0][0].filter).toEqual({ documentId: { $in: ["d1", "d2"] } });
  });

  it("searchVector([] allowlist) returns [] without querying", async () => {
    const dense = fakeDense();
    const out = await createPineconeStore(() => dense, () => fakeSparse()).searchVector([0.1], 5, []);
    expect(out).toEqual([]);
    expect(dense.query).not.toHaveBeenCalled();
  });

  it("searchVector without an allowlist adds no filter", async () => {
    const dense = fakeDense();
    await createPineconeStore(() => dense, () => fakeSparse()).searchVector([0.1], 5);
    expect(dense.query.mock.calls[0][0].filter).toBeUndefined();
  });

  it("searchKeyword([] allowlist) returns [] without querying either index", async () => {
    const dense = fakeDense();
    const sparse = fakeSparse();
    const out = await createPineconeStore(() => dense, () => sparse).searchKeyword("hello", [0.1], 5, []);
    expect(out).toEqual([]);
    expect(sparse.searchRecords).not.toHaveBeenCalled();
    expect(dense.fetch).not.toHaveBeenCalled();
  });

  it("searchKeyword post-filters hits to the allowlist by documentId", async () => {
    const dense = fakeDense({
      fetch: vi.fn(async () => ({
        records: {
          "d1#a": { id: "d1#a", values: [0.1], metadata: { documentId: "d1", filename: "f1", content: "c1" } },
          "d2#b": { id: "d2#b", values: [0.1], metadata: { documentId: "d2", filename: "f2", content: "c2" } },
        },
      })),
    });
    const sparse = fakeSparse({
      searchRecords: vi.fn(async () => ({ result: { hits: [{ _id: "d1#a" }, { _id: "d2#b" }] } })),
    });
    const out = await createPineconeStore(() => dense, () => sparse).searchKeyword("hello", [0.1], 5, ["d1"]);
    expect(out.map((c) => c.documentId)).toEqual(["d1"]);
  });

  it("existingHashes fetches ids in batches of 1000", async () => {
    const ids = Array.from({ length: 2500 }, (_, i) => `d1#${i}`);
    const dense = fakeDense({
      listPaginated: vi.fn(async () => ({ vectors: ids.map((id) => ({ id })), pagination: undefined })),
      fetch: vi.fn(async (batch: string[]) => ({
        records: Object.fromEntries(batch.map((id) => [id, { id, metadata: { contentHash: id } }])),
      })),
    });
    const out = await createPineconeStore(() => dense, () => fakeSparse()).existingHashes("d1");
    expect(dense.fetch).toHaveBeenCalledTimes(3);
    expect(dense.fetch.mock.calls.map((c) => c[0].length)).toEqual([1000, 1000, 500]);
    expect(out.size).toBe(2500);
  });

  it("deleteByDocument deletes ids in batches of 1000 from both indexes", async () => {
    const ids = Array.from({ length: 2500 }, (_, i) => `d1#${i}`);
    const dense = fakeDense({ listPaginated: vi.fn(async () => ({ vectors: ids.map((id) => ({ id })), pagination: undefined })) });
    const sparse = fakeSparse();
    await createPineconeStore(() => dense, () => sparse).deleteByDocument("d1");
    expect(dense.deleteMany).toHaveBeenCalledTimes(3);
    expect(sparse.deleteMany).toHaveBeenCalledTimes(3);
    expect(dense.deleteMany.mock.calls.map((c) => c[0].length)).toEqual([1000, 1000, 500]);
    expect(sparse.deleteMany.mock.calls.map((c) => c[0].length)).toEqual([1000, 1000, 500]);
  });
});
