import { describe, it, expect, vi } from "vitest";
import { createChromaStore } from "./store";

function fakeCollection(over: Partial<any> = {}) {
  return {
    add: vi.fn(async () => ({})),
    get: vi.fn(async () => ({ metadatas: [] })),
    delete: vi.fn(async () => ({})),
    query: vi.fn(async () => ({ ids: [[]], documents: [[]], metadatas: [[]], distances: [[]] })),
    ...over,
  } as any;
}
const provide = (c: any) => async () => c;

describe("chroma store", () => {
  it("upsertChunks adds ids + embeddings + documents + metadatas", async () => {
    const col = fakeCollection();
    await createChromaStore(provide(col)).upsertChunks([
      { documentId: "d1", filename: "f.md", content: "hi", embedding: [0.1, 0.2], contentHash: "h1" },
    ]);
    expect(col.add).toHaveBeenCalledTimes(1);
    const arg = col.add.mock.calls[0][0];
    expect(arg.embeddings).toEqual([[0.1, 0.2]]);
    expect(arg.documents).toEqual(["hi"]);
    expect(arg.metadatas[0]).toMatchObject({ documentId: "d1", filename: "f.md", content: "hi", contentHash: "h1" });
    expect(arg.ids).toHaveLength(1);
  });

  it("upsertChunks with an empty array does not call the collection", async () => {
    const col = fakeCollection();
    await createChromaStore(provide(col)).upsertChunks([]);
    expect(col.add).not.toHaveBeenCalled();
  });

  it("existingHashes collects contentHash from metadatas filtered by documentId", async () => {
    const col = fakeCollection({
      get: vi.fn(async () => ({ metadatas: [{ contentHash: "h1" }, { contentHash: "h2" }] })),
    });
    const out = await createChromaStore(provide(col)).existingHashes("d1");
    expect(col.get.mock.calls[0][0].where).toEqual({ documentId: "d1" });
    expect([...out].sort()).toEqual(["h1", "h2"]);
  });

  it("deleteByDocument filters by documentId", async () => {
    const col = fakeCollection();
    await createChromaStore(provide(col)).deleteByDocument("d1");
    expect(col.delete).toHaveBeenCalledWith({ where: { documentId: "d1" } });
  });

  it("searchVector maps results with score = 1 - distance (cosine)", async () => {
    const col = fakeCollection({
      query: vi.fn(async () => ({
        ids: [["p1"]],
        documents: [["hi"]],
        metadatas: [[{ documentId: "d1", filename: "f.md", content: "hi" }]],
        distances: [[0.13]],
      })),
    });
    const out = await createChromaStore(provide(col)).searchVector([0.1], 5);
    expect(out).toEqual([{ chunkId: "p1", documentId: "d1", filename: "f.md", content: "hi", score: 0.87 }]);
  });

  it("searchKeyword passes whereDocument $contains and returns [] for short queries", async () => {
    const col = fakeCollection();
    const store = createChromaStore(provide(col));
    expect(await store.searchKeyword("a", [0.1], 5)).toEqual([]);
    expect(col.query).not.toHaveBeenCalled();
    await store.searchKeyword("dog", [0.1], 5);
    expect(col.query.mock.calls[0][0].whereDocument).toEqual({ $contains: "dog" });
  });

  it("searchVector passes the allowlist as a where $in filter", async () => {
    const col = fakeCollection();
    await createChromaStore(provide(col)).searchVector([0.1], 5, ["d1", "d2"]);
    expect(col.query.mock.calls[0][0].where).toEqual({ documentId: { $in: ["d1", "d2"] } });
  });

  it("searchVector([] allowlist) returns [] without querying", async () => {
    const col = fakeCollection();
    const out = await createChromaStore(provide(col)).searchVector([0.1], 5, []);
    expect(out).toEqual([]);
    expect(col.query).not.toHaveBeenCalled();
  });

  it("searchVector(undefined allowlist) omits where", async () => {
    const col = fakeCollection();
    await createChromaStore(provide(col)).searchVector([0.1], 5);
    expect(col.query.mock.calls[0][0].where).toBeUndefined();
  });

  it("searchKeyword passes both whereDocument and the allowlist where filter", async () => {
    const col = fakeCollection();
    await createChromaStore(provide(col)).searchKeyword("dog", [0.1], 5, ["d1"]);
    expect(col.query.mock.calls[0][0].whereDocument).toEqual({ $contains: "dog" });
    expect(col.query.mock.calls[0][0].where).toEqual({ documentId: { $in: ["d1"] } });
  });

  it("searchKeyword([] allowlist) returns [] without querying", async () => {
    const col = fakeCollection();
    const out = await createChromaStore(provide(col)).searchKeyword("dog", [0.1], 5, []);
    expect(out).toEqual([]);
    expect(col.query).not.toHaveBeenCalled();
  });
});
