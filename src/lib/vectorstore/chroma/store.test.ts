import { describe, it, expect, vi, type Mock } from "vitest";
import { createChromaStore, type ChromaCollectionLike } from "./store";

// ChromaCollectionLike is the store's own narrow seam (see store.ts), so its
// method types are exactly the contract this fake stands in for. Deliberate:
// merging a `Partial<ChromaCollectionLike>` override into an object literal of
// vi.fn()s here contextually collapses the Mock type the assertions below need
// for `.mock.calls` — so this fake keeps its own shape (Partial<FakeCollection>
// overrides), typing each method as `Mock<ChromaCollectionLike["method"]>`
// rather than a bare `Mock`.
interface FakeCollection {
  add: Mock<ChromaCollectionLike["add"]>;
  get: Mock<ChromaCollectionLike["get"]>;
  delete: Mock<ChromaCollectionLike["delete"]>;
  query: Mock<ChromaCollectionLike["query"]>;
}
function fakeCollection(over: Partial<FakeCollection> = {}): FakeCollection {
  return {
    add: vi.fn(async () => ({})),
    get: vi.fn(async () => ({ metadatas: [] })),
    delete: vi.fn(async () => ({})),
    query: vi.fn(async () => ({ ids: [[]], documents: [[]], metadatas: [[]], distances: [[]] })),
    ...over,
  };
}
const provide = (c: FakeCollection) => async () => c as unknown as ChromaCollectionLike;

describe("chroma store", () => {
  it("upsertChunks adds ids + embeddings + documents + metadatas", async () => {
    const col = fakeCollection();
    await createChromaStore(provide(col)).upsertChunks([
      { documentId: "d1", filename: "f.md", content: "hi", embedding: [0.1, 0.2], contentHash: "h1", chunkIndex: 1 },
    ]);
    expect(col.add).toHaveBeenCalledTimes(1);
    const arg = col.add.mock.calls[0][0];
    expect(arg.embeddings).toEqual([[0.1, 0.2]]);
    expect(arg.documents).toEqual(["hi"]);
    // chunkIndex is stringified because ChromaCollectionLike constrains metadata
    // values to strings.
    expect(arg.metadatas[0]).toMatchObject({ documentId: "d1", filename: "f.md", content: "hi", contentHash: "h1", chunkIndex: "1" });
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

  it("listChunks parses the stringified chunkIndex back to a number, sorts by chunkIndex nulls last, slices the page, and returns the document's full count as total (not the page length)", async () => {
    const col = fakeCollection({
      get: vi.fn(async () => ({
        metadatas: [
          { content: "c2", contentHash: "h2", chunkIndex: "2" },
          { content: "c-legacy", contentHash: "h-legacy" }, // pre-Task-1 chunk: no chunkIndex key at all
          { content: "c0", contentHash: "h0", chunkIndex: "0" },
          { content: "c1", contentHash: "h1", chunkIndex: "1" },
        ],
      })),
    });
    const out = await createChromaStore(provide(col)).listChunks("d1", { limit: 2, offset: 1 });
    expect(col.get.mock.calls[0][0].where).toEqual({ documentId: "d1" });
    expect(out.total).toBe(4); // full document count, not the 2-row page
    expect(out.rows).toEqual([
      { chunkIndex: 1, content: "c1", contentHash: "h1" },
      { chunkIndex: 2, content: "c2", contentHash: "h2" },
    ]);
    // Must come back as a real number, not the "2" string Chroma metadata stores.
    expect(typeof out.rows[0].chunkIndex).toBe("number");
  });

  it("listChunks puts the legacy (no chunkIndex) chunk last", async () => {
    const col = fakeCollection({
      get: vi.fn(async () => ({
        metadatas: [
          { content: "c-legacy", contentHash: "h-legacy" },
          { content: "c0", contentHash: "h0", chunkIndex: "0" },
        ],
      })),
    });
    const out = await createChromaStore(provide(col)).listChunks("d1", { limit: 10, offset: 0 });
    expect(out.rows.map((r) => r.chunkIndex)).toEqual([0, null]);
  });
});
