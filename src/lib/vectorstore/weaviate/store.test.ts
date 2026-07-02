import { describe, it, expect, vi } from "vitest";
import { createWeaviateStore } from "./store";

// Fake collection mirroring the weaviate-client v3 handle surface the store uses.
function fakeCollection(over: any = {}) {
  return {
    data: {
      insertMany: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({})),
    },
    query: {
      fetchObjects: vi.fn(async () => ({ objects: [] })),
      nearVector: vi.fn(async () => ({ objects: [] })),
      bm25: vi.fn(async () => ({ objects: [] })),
    },
    filter: { byProperty: (p: string) => ({ equal: (v: unknown) => ({ p, v }) }) },
    ...over,
  } as any;
}
const provide = (c: any) => async () => c;

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
      query: {
        fetchObjects: vi.fn(async () => ({ objects: [{ properties: { contentHash: "h1" } }, { properties: { contentHash: "h2" } }] })),
        nearVector: vi.fn(async () => ({ objects: [] })),
        bm25: vi.fn(async () => ({ objects: [] })),
      },
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
      query: {
        nearVector: vi.fn(async () => ({ objects: [
          { uuid: "u1", properties: { documentId: "d1", filename: "f.md", content: "hi" }, metadata: { distance: 0.13 } },
        ] })),
        fetchObjects: vi.fn(async () => ({ objects: [] })),
        bm25: vi.fn(async () => ({ objects: [] })),
      },
    });
    const out = await createWeaviateStore(provide(col)).searchVector([0.1], 5);
    expect(out).toEqual([{ chunkId: "u1", documentId: "d1", filename: "f.md", content: "hi", score: 0.87 }]);
  });

  it("searchKeyword uses bm25 and recomputes cosine score from the returned vector", async () => {
    const col = fakeCollection({
      query: {
        bm25: vi.fn(async () => ({ objects: [
          { uuid: "u2", properties: { documentId: "d1", filename: "f.md", content: "dog" }, vectors: { default: [1, 0] } },
        ] })),
        nearVector: vi.fn(async () => ({ objects: [] })),
        fetchObjects: vi.fn(async () => ({ objects: [] })),
      },
    });
    const store = createWeaviateStore(provide(col));
    expect(await store.searchKeyword("a", [1, 0], 5)).toEqual([]); // too short
    const out = await store.searchKeyword("dog", [1, 0], 5);
    expect(col.query.bm25).toHaveBeenCalled();
    expect(out[0].chunkId).toBe("u2");
    expect(out[0].score).toBeCloseTo(1); // query [1,0] vs vector [1,0]
  });
});
