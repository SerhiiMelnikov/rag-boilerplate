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
      { documentId: "d1", filename: "f.md", content: "hi", embedding: [0.1, 0.2], contentHash: "h1", chunkIndex: 1 },
    ]);
    const denseArg = dense.upsert.mock.calls[0][0];
    expect(denseArg[0].id.startsWith("d1#")).toBe(true);
    expect(denseArg[0].values).toEqual([0.1, 0.2]);
    expect(denseArg[0].metadata).toMatchObject({ documentId: "d1", filename: "f.md", content: "hi", contentHash: "h1", chunkIndex: 1 });
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

  it("listChunks fetches every id's metadata (not just the requested page's), sorts the whole document by chunkIndex nulls last, THEN slices the window", async () => {
    // Pinecone's list order is arbitrary (lexicographic by id), unrelated to
    // chunkIndex — ids intentionally aren't in chunkIndex order here. Slicing
    // the id list BEFORE fetching metadata (the bug this guards against) would
    // fetch and sort only whichever ids happen to land in [offset, offset+limit)
    // of that arbitrary id order, not the chunks that actually belong there.
    const ids = ["d1#a", "d1#b", "d1#c", "d1#d", "d1#e"];
    const metaById: Record<string, { content: string; contentHash: string; chunkIndex?: number }> = {
      "d1#a": { content: "ca", contentHash: "ha", chunkIndex: 4 },
      "d1#b": { content: "cb", contentHash: "hb", chunkIndex: 1 },
      "d1#c": { content: "cc", contentHash: "hc" }, // legacy: no chunkIndex
      "d1#d": { content: "cd", contentHash: "hd", chunkIndex: 3 },
      "d1#e": { content: "ce", contentHash: "he", chunkIndex: 2 },
    };
    const dense = fakeDense({
      listPaginated: vi.fn(async () => ({ vectors: ids.map((id) => ({ id })), pagination: undefined })),
      fetch: vi.fn(async (batch: string[]) => ({
        records: Object.fromEntries(batch.map((id) => [id, { id, metadata: metaById[id] }])),
      })),
    });
    const out = await createPineconeStore(() => dense, () => fakeSparse()).listChunks("d1", { limit: 2, offset: 1 });
    expect(out.total).toBe(5); // full document count, not the 2-row page
    // Every id was fetched, not just the ones landing in the requested window.
    expect(dense.fetch).toHaveBeenCalledTimes(1);
    expect(dense.fetch.mock.calls[0][0]).toEqual(ids);
    // Sorted ascending nulls-last: b(1), e(2), d(3), a(4), c(null). offset 1,
    // limit 2 -> [e, d] — the true chunkIndex 2-3 window, not an id-order slice.
    expect(out.rows).toEqual([
      { chunkIndex: 2, content: "ce", contentHash: "he" },
      { chunkIndex: 3, content: "cd", contentHash: "hd" },
    ]);
  });

  it("listChunks reconstructs true chunkIndex order across a document larger than one fetch batch, in an id order unrelated to chunkIndex", async () => {
    // 1300 ids (more than one PINECONE_BATCH of 1000) returned by listPaginated
    // in an order unrelated to chunkIndex: id "d1#0000" holds the HIGHEST
    // chunkIndex, "d1#1299" the lowest — reproducing Pinecone's real
    // lexicographic-by-id list order. The pre-fix code sliced this id list to
    // [0, 10) BEFORE fetching metadata, so {limit:10, offset:0} returned
    // whichever 10 ids happened to sort first lexicographically (chunkIndex
    // 1290-1299, an arbitrary window), not chunkIndex 0-9.
    const total = 1300;
    const ids = Array.from({ length: total }, (_, i) => `d1#${String(i).padStart(4, "0")}`);
    const chunkIndexForId = (id: string) => total - 1 - Number(id.slice(3));
    const dense = fakeDense({
      listPaginated: vi.fn(async () => ({ vectors: ids.map((id) => ({ id })), pagination: undefined })),
      fetch: vi.fn(async (batch: string[]) => ({
        records: Object.fromEntries(
          batch.map((id) => [id, { id, metadata: { content: `c-${id}`, contentHash: `h-${id}`, chunkIndex: chunkIndexForId(id) } }]),
        ),
      })),
    });
    const out = await createPineconeStore(() => dense, () => fakeSparse()).listChunks("d1", { limit: 10, offset: 0 });
    expect(out.total).toBe(total);
    expect(out.rows.map((r) => r.chunkIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // Every id across both batches was fetched (fetchAllRecords batches at 1000).
    expect(dense.fetch).toHaveBeenCalledTimes(2);
  });

  it("listChunks returns an empty page without fetching when the document has no chunks", async () => {
    const dense = fakeDense({ listPaginated: vi.fn(async () => ({ vectors: [], pagination: undefined })) });
    const out = await createPineconeStore(() => dense, () => fakeSparse()).listChunks("d1", { limit: 10, offset: 0 });
    expect(out).toEqual({ rows: [], total: 0 });
    expect(dense.fetch).not.toHaveBeenCalled();
  });
});
