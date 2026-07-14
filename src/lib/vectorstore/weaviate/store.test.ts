import { describe, it, expect, vi } from "vitest";
import { createWeaviateStore, type WeaviateCollectionLike } from "./store";

// Fake collection mirroring the weaviate-client v3 handle surface the store
// uses. WeaviateCollectionLike is the store's own narrow seam (see store.ts),
// kept local precisely so fakes like this one don't need the full client types.
// `query` is the only sub-object tests ever override, so it alone is generic
// (inferred per call) rather than the whole return type: a return-type
// annotation, or a non-generic `Partial<...>` parameter, would each
// contextually widen the vi.fn()s back down to plain functions, erasing the
// Mock type the assertions below rely on for `.mock.calls`.
function fakeCollection<Q extends Partial<WeaviateCollectionLike["query"]> = Record<string, never>>(overQuery: Q = {} as never) {
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
      }),
    },
  };
}
const provide = (c: WeaviateCollectionLike) => async () => c;

describe("weaviate store", () => {
  it("upsertChunks inserts objects with properties + vectors", async () => {
    const col = fakeCollection();
    await createWeaviateStore(provide(col)).upsertChunks([
      { documentId: "d1", filename: "f.md", content: "hi", embedding: [0.1, 0.2], contentHash: "h1" },
    ]);
    const arg = col.data.insertMany.mock.calls[0][0];
    expect(arg[0].properties).toMatchObject({ documentId: "d1", filename: "f.md", content: "hi", contentHash: "h1" });
    expect(arg[0].vectors).toEqual([0.1, 0.2]);
  });

  it("upsertChunks with an empty array does not call the collection", async () => {
    const col = fakeCollection();
    await createWeaviateStore(provide(col)).upsertChunks([]);
    expect(col.data.insertMany).not.toHaveBeenCalled();
  });

  it("existingHashes collects contentHash filtered by documentId", async () => {
    const col = fakeCollection({
      fetchObjects: vi.fn(async () => ({ objects: [{ uuid: "p1", properties: { contentHash: "h1" } }, { uuid: "p2", properties: { contentHash: "h2" } }] })),
    });
    const out = await createWeaviateStore(provide(col)).existingHashes("d1");
    expect([...out].sort()).toEqual(["h1", "h2"]);
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
});
