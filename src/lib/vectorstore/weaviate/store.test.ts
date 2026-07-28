import { describe, it, expect, vi } from "vitest";
import { createWeaviateStore, type WeaviateCollectionLike } from "./store";

// Fake collection mirroring the weaviate-client v3 handle surface the store
// uses. WeaviateCollectionLike is the store's own narrow seam (see store.ts),
// kept local precisely so fakes like this one don't need the full client types.
// `query` and `aggregate` are the only sub-objects tests override, so those
// alone are generic (inferred per call) rather than the whole return type: a
// return-type annotation, or a non-generic `Partial<...>` parameter, would
// each contextually widen the vi.fn()s back down to plain functions, erasing
// the Mock type the assertions below rely on for `.mock.calls`.
function fakeCollection<
  Q extends Partial<WeaviateCollectionLike["query"]> = Record<string, never>,
  A extends Partial<WeaviateCollectionLike["aggregate"]> = Record<string, never>,
>(overQuery: Q = {} as never, overAggregate: A = {} as never) {
  return {
    data: {
      insertMany: vi.fn(async (_objs: Parameters<WeaviateCollectionLike["data"]["insertMany"]>[0]) => ({})),
      deleteMany: vi.fn(async (_where: Parameters<WeaviateCollectionLike["data"]["deleteMany"]>[0]) => ({})),
    },
    query: {
      fetchObjects: vi.fn(async () => ({ objects: [] })),
      nearVector: vi.fn(async () => ({ objects: [] })),
      bm25: vi.fn(async () => ({ objects: [] })),
      ...overQuery,
    },
    filter: {
      byProperty: (p: string) => ({
        equal: (v: unknown) => ({ p, v }),
        containsAny: (v: unknown[]) => ({ p, op: "containsAny", v }),
        greaterOrEqual: (v: number) => ({ p, op: "greaterOrEqual", v }),
      }),
    },
    sort: {
      byProperty: (p: string, ascending?: boolean) => ({ p, op: "sort", ascending }),
    },
    aggregate: {
      overAll: vi.fn(async () => ({ totalCount: 0 })),
      ...overAggregate,
    },
  };
}
const provide = (c: WeaviateCollectionLike) => async () => c;

describe("weaviate store", () => {
  it("upsertChunks inserts objects with properties + vectors", async () => {
    const col = fakeCollection();
    await createWeaviateStore(provide(col)).upsertChunks([
      { documentId: "d1", filename: "f.md", content: "hi", embedding: [0.1, 0.2], contentHash: "h1", chunkIndex: 1 },
    ]);
    const arg = col.data.insertMany.mock.calls[0][0];
    expect(arg[0].properties).toMatchObject({ documentId: "d1", filename: "f.md", content: "hi", contentHash: "h1", chunkIndex: 1 });
    expect(arg[0].vectors).toEqual([0.1, 0.2]);
  });

  it("upsertChunks with an empty array does not call the collection", async () => {
    const col = fakeCollection();
    await createWeaviateStore(provide(col)).upsertChunks([]);
    expect(col.data.insertMany).not.toHaveBeenCalled();
  });

  it("upsertChunks derives the same id for the same (documentId, contentHash) on a re-ingest, so a real store overwrites instead of appending", async () => {
    const col = fakeCollection();
    const store = createWeaviateStore(provide(col));
    const row = { documentId: "d1", filename: "f.md", content: "hi", embedding: [0.1, 0.2], contentHash: "h1", chunkIndex: 1 };
    await store.upsertChunks([row]);
    await store.upsertChunks([row]); // simulated re-ingest of the same chunk
    const [firstId, secondId] = col.data.insertMany.mock.calls.map((c) => c[0][0].id);
    expect(firstId).toEqual(expect.any(String));
    expect(firstId).toBe(secondId);
  });

  it("upsertChunks derives a different id when contentHash changes", async () => {
    const col = fakeCollection();
    const store = createWeaviateStore(provide(col));
    await store.upsertChunks([{ documentId: "d1", filename: "f.md", content: "hi", embedding: [0.1], contentHash: "h1", chunkIndex: 0 }]);
    await store.upsertChunks([{ documentId: "d1", filename: "f.md", content: "hi v2", embedding: [0.1], contentHash: "h2", chunkIndex: 0 }]);
    const [firstId, secondId] = col.data.insertMany.mock.calls.map((c) => c[0][0].id);
    expect(firstId).not.toBe(secondId);
  });

  // The bug this guards: ingest.ts doesn't dedupe within a batch, so a document
  // containing the same text twice sends two rows with identical (documentId,
  // contentHash). With the id derived from those two fields alone, both rows
  // land on the same id and the second insertMany call silently overwrites the
  // first (no error) — the earlier position vanishes, the survivor carries the
  // wrong chunkIndex, and existingHashes/`total` under-report forever.
  // Including chunkIndex in the id keeps distinct positions as distinct objects.
  it("upsertChunks derives different ids for two rows with identical content at different chunk positions within the same document", async () => {
    const col = fakeCollection();
    const store = createWeaviateStore(provide(col));
    await store.upsertChunks([
      { documentId: "d1", filename: "f.md", content: "same text", embedding: [0.1], contentHash: "h-same", chunkIndex: 0 },
      { documentId: "d1", filename: "f.md", content: "same text", embedding: [0.2], contentHash: "h-same", chunkIndex: 1 },
    ]);
    const [id0, id1] = col.data.insertMany.mock.calls[0][0].map((o) => o.id);
    expect(id0).not.toBe(id1);
  });

  it("existingHashes collects contentHash filtered by documentId", async () => {
    const col = fakeCollection({
      fetchObjects: vi.fn(async () => ({ objects: [{ uuid: "p1", properties: { contentHash: "h1" } }, { uuid: "p2", properties: { contentHash: "h2" } }] })),
    });
    const out = await createWeaviateStore(provide(col)).existingHashes("d1");
    expect([...out].sort()).toEqual(["h1", "h2"]);
  });

  it("existingHashes pages with offset (page size 500) until a short page comes back, collecting every page", async () => {
    const PAGE_SIZE = 500;
    const page0 = Array.from({ length: PAGE_SIZE }, (_, i) => ({ uuid: `p${i}`, properties: { contentHash: `h${i}` } }));
    const page1 = [{ uuid: "p-last", properties: { contentHash: "h-last" } }]; // short page -> loop stops here
    const fetchObjects = vi.fn(async (args: { offset?: number }) => ({ objects: (args.offset ?? 0) === 0 ? page0 : page1 }));
    const col = fakeCollection({ fetchObjects });
    const out = await createWeaviateStore(provide(col)).existingHashes("d1");
    expect(out.size).toBe(PAGE_SIZE + 1);
    expect(out.has("h-last")).toBe(true);
    expect(fetchObjects).toHaveBeenCalledTimes(2);
    expect(fetchObjects.mock.calls[0][0]).toMatchObject({ limit: PAGE_SIZE, offset: 0 });
    expect(fetchObjects.mock.calls[1][0]).toMatchObject({ limit: PAGE_SIZE, offset: PAGE_SIZE });
  });

  // The bug this guards: the paging loop used to have no upper bound at all —
  // for a document with >=10000 chunks (every page comes back full, so the
  // "stop on a short page" condition never fires), it would eventually issue
  // offset: 10000, which the real Weaviate server rejects outright ("invalid
  // pagination"). ingestExistingDocument catches that and marks the WHOLE
  // document status: "error" with nothing stored — worse than a merely
  // truncated hash set. The fix stops paging one page shy of the ceiling.
  it("existingHashes stops before the offset would reach the QUERY_MAXIMUM_RESULTS ceiling, never issuing offset: 10000", async () => {
    const PAGE_SIZE = 500;
    const CEILING = 10_000;
    // Every page comes back full (as if the document has far more than 10000
    // chunks) so the loop would never stop on its own via a short page.
    const fetchObjects = vi.fn(async (args: { offset?: number }) => ({
      objects: Array.from({ length: PAGE_SIZE }, (_, i) => ({ uuid: `p${args.offset}-${i}`, properties: { contentHash: `h${args.offset}-${i}` } })),
    }));
    const col = fakeCollection({ fetchObjects });
    const out = await createWeaviateStore(provide(col)).existingHashes("d1");
    expect(out.size).toBe(CEILING); // 20 full pages of 500, then stops
    expect(fetchObjects).toHaveBeenCalledTimes(CEILING / PAGE_SIZE);
    const offsetsRequested = fetchObjects.mock.calls.map((c) => c[0].offset ?? 0);
    expect(Math.max(...offsetsRequested)).toBe(CEILING - PAGE_SIZE); // 9500 — 10000 is never requested
  });

  it("deleteByDocument calls deleteMany with a documentId filter", async () => {
    const col = fakeCollection();
    await createWeaviateStore(provide(col)).deleteByDocument("d1");
    expect(col.data.deleteMany).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(col.data.deleteMany.mock.calls[0][0])).toContain("d1");
  });

  it("searchVector maps score = 1 - distance (cosine)", async () => {
    const col = fakeCollection({
      nearVector: vi.fn(async () => ({ objects: [
        { uuid: "u1", properties: { documentId: "d1", filename: "f.md", content: "hi" }, metadata: { distance: 0.13 } },
      ] })),
    });
    const out = await createWeaviateStore(provide(col)).searchVector([0.1], 5);
    expect(out).toEqual([{ chunkId: "u1", documentId: "d1", filename: "f.md", content: "hi", score: 0.87 }]);
  });

  it("searchKeyword uses bm25 and recomputes cosine score from the returned vector", async () => {
    const col = fakeCollection({
      bm25: vi.fn(async () => ({ objects: [
        { uuid: "u2", properties: { documentId: "d1", filename: "f.md", content: "dog" }, vectors: { default: [1, 0] } },
      ] })),
    });
    const store = createWeaviateStore(provide(col));
    expect(await store.searchKeyword("a", [1, 0], 5)).toEqual([]); // too short
    const out = await store.searchKeyword("dog", [1, 0], 5);
    expect(col.query.bm25).toHaveBeenCalled();
    expect(out[0].chunkId).toBe("u2");
    expect(out[0].score).toBeCloseTo(1); // query [1,0] vs vector [1,0]
  });

  it("searchVector passes a containsAny(documentId) filter to nearVector", async () => {
    const nearVector = vi.fn(async (_vector: number[], _args: { limit: number; returnMetadata?: string[]; filters?: unknown }) => ({ objects: [] }));
    const col = fakeCollection({ nearVector });
    await createWeaviateStore(provide(col)).searchVector([0.1], 5, ["d1", "d2"]);
    expect(nearVector.mock.calls[0][1].filters).toEqual({ p: "documentId", op: "containsAny", v: ["d1", "d2"] });
  });

  it("searchVector([] allowlist) returns [] without querying", async () => {
    const nearVector = vi.fn(async () => ({ objects: [] }));
    const col = fakeCollection({ nearVector });
    const out = await createWeaviateStore(provide(col)).searchVector([0.1], 5, []);
    expect(out).toEqual([]);
    expect(nearVector).not.toHaveBeenCalled();
  });

  it("searchKeyword passes a containsAny(documentId) filter to bm25", async () => {
    const bm25 = vi.fn(async (_query: string, _args: { limit: number; includeVector?: boolean; filters?: unknown }) => ({ objects: [] }));
    const col = fakeCollection({ bm25 });
    await createWeaviateStore(provide(col)).searchKeyword("dog", [1, 0], 5, ["d1", "d2"]);
    expect(bm25.mock.calls[0][1].filters).toEqual({ p: "documentId", op: "containsAny", v: ["d1", "d2"] });
  });

  it("searchKeyword([] allowlist) returns [] without querying", async () => {
    const bm25 = vi.fn(async () => ({ objects: [] }));
    const col = fakeCollection({ bm25 });
    const out = await createWeaviateStore(provide(col)).searchKeyword("dog", [1, 0], 5, []);
    expect(out).toEqual([]);
    expect(bm25).not.toHaveBeenCalled();
  });

  // --- listChunks --------------------------------------------------------
  // Weaviate's `sort` composes with a filter and returns genuinely
  // globally-ordered pages (live-probed against :8081). But an object missing
  // the sorted property entirely (a pre-Task-1 chunk with no recorded
  // chunkIndex) is silently DROPPED by that sort rather than placed last —
  // also live-probed, and confirmed a schema migration (`indexNullState`)
  // would be needed to isolate them with `isNull`, which is out of scope. So
  // listChunks only takes the sort fast path when a cheap range-filtered
  // aggregate count (chunkIndex >= 0, which naturally excludes objects
  // missing the property — no schema change needed) matches the document's
  // full total; otherwise it falls back to the unsorted fetch + in-memory
  // sort so no legacy chunk is ever silently dropped from the page.

  function docFilterArg(documentId: string) {
    return { p: "documentId", v: documentId };
  }
  // aggregate.overAll is called twice (total, then the range-filtered "has
  // chunkIndex" count); tell them apart by the filter's shape rather than
  // call order, since Filters.and wraps its args in { operator: "And", ... }.
  function fakeAggregate(totalCount: number, hasChunkIndexCount: number) {
    return vi.fn(async (args: { filters?: { operator?: string } }) => ({
      totalCount: args.filters?.operator === "And" ? hasChunkIndexCount : totalCount,
    }));
  }

  it("listChunks sorts server-side (fast path) when every chunk in the document has chunkIndex, and total comes from aggregate.overAll", async () => {
    const fetchObjects = vi.fn(async (_args: { filters?: unknown; limit?: number; offset?: number; sort?: unknown }) => ({
      objects: [
        { uuid: "u1", properties: { content: "c1", contentHash: "h1", chunkIndex: 1 } },
        { uuid: "u0", properties: { content: "c0", contentHash: "h0", chunkIndex: 0 } },
      ],
    }));
    const overAll = fakeAggregate(3, 3); // hasChunkIndexTotal === total -> fast path
    const col = fakeCollection({ fetchObjects }, { overAll });
    const out = await createWeaviateStore(provide(col)).listChunks("d1", { limit: 2, offset: 0 });
    expect(out.total).toBe(3);
    expect(out.rows).toEqual([
      { chunkIndex: 0, content: "c0", contentHash: "h0" },
      { chunkIndex: 1, content: "c1", contentHash: "h1" },
    ]);
    expect(overAll).toHaveBeenCalledTimes(2);
    expect(fetchObjects).toHaveBeenCalledTimes(1);
    const pageCall = fetchObjects.mock.calls[0][0];
    expect(pageCall).toMatchObject({ limit: 2, offset: 0, filters: docFilterArg("d1") });
    // The load-bearing assertion: the server-side sort argument was passed.
    expect(pageCall.sort).toEqual({ p: "chunkIndex", op: "sort", ascending: true });
  });

  it("listChunks falls back to the unsorted fetch (no sort argument) when the document has a legacy chunk with no chunkIndex, and still returns it (nulls last) without dropping anything", async () => {
    const fetchObjects = vi.fn(async (_args: { filters?: unknown; limit?: number; offset?: number; sort?: unknown }) => ({
      objects: [
        { uuid: "u1", properties: { content: "c1", contentHash: "h1", chunkIndex: 1 } },
        { uuid: "u-legacy", properties: { content: "c-legacy", contentHash: "h-legacy" } }, // no chunkIndex at all
        { uuid: "u0", properties: { content: "c0", contentHash: "h0", chunkIndex: 0 } },
      ],
    }));
    const overAll = fakeAggregate(4, 3); // hasChunkIndexTotal(3) !== total(4) -> fallback
    const col = fakeCollection({ fetchObjects }, { overAll });
    const out = await createWeaviateStore(provide(col)).listChunks("d1", { limit: 3, offset: 0 });
    expect(out.total).toBe(4); // full document count, including the legacy chunk
    expect(out.rows).toEqual([
      { chunkIndex: 0, content: "c0", contentHash: "h0" },
      { chunkIndex: 1, content: "c1", contentHash: "h1" },
      { chunkIndex: null, content: "c-legacy", contentHash: "h-legacy" },
    ]);
    const pageCall = fetchObjects.mock.calls[0][0];
    expect(pageCall).toMatchObject({ limit: 3, offset: 0, filters: docFilterArg("d1") });
    expect(pageCall.sort).toBeUndefined();
  });
});
