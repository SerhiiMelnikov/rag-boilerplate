import { describe, it, expect, vi, type Mock } from "vitest";
import { createQdrantStore } from "./store";

// Deliberate: QdrantClient (the real param type) is the full third-party SDK
// client; this fake only implements the four calls the store actually makes.
// `never` (not `any`) bridges it at each call site below.
interface FakeQdrantClient {
  upsert: Mock;
  delete: Mock;
  query: Mock;
  scroll: Mock;
}

function fakeClient(over: Partial<FakeQdrantClient> = {}): FakeQdrantClient {
  return {
    upsert: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
    query: vi.fn(async () => ({ points: [] })),
    scroll: vi.fn(async () => ({ points: [], next_page_offset: null })),
    ...over,
  };
}

describe("qdrant store", () => {
  it("upsertChunks sends points with vector + payload (documentId, content, contentHash, filename)", async () => {
    const client = fakeClient();
    await createQdrantStore(client as never, "c").upsertChunks([
      { documentId: "d1", filename: "f.md", content: "hi", embedding: [0.1, 0.2], contentHash: "h1" },
    ]);
    expect(client.upsert).toHaveBeenCalledTimes(1);
    const arg = client.upsert.mock.calls[0][1];
    expect(arg.points[0].vector).toEqual([0.1, 0.2]);
    expect(arg.points[0].payload).toMatchObject({ documentId: "d1", content: "hi", contentHash: "h1", filename: "f.md" });
  });

  it("upsertChunks with an empty array does not call the client", async () => {
    const client = fakeClient();
    await createQdrantStore(client as never, "c").upsertChunks([]);
    expect(client.upsert).not.toHaveBeenCalled();
  });

  it("searchVector maps query() points to RetrievedChunk (score = cosine)", async () => {
    const client = fakeClient({
      query: vi.fn(async () => ({ points: [
        { id: "p1", score: 0.87, payload: { documentId: "d1", content: "hi", filename: "f.md", contentHash: "h1" } },
      ] })),
    });
    const out = await createQdrantStore(client as never, "c").searchVector([0.1], 5);
    expect(out).toEqual([{ chunkId: "p1", documentId: "d1", filename: "f.md", content: "hi", score: 0.87 }]);
  });

  it("existingHashes scrolls by documentId and collects contentHash", async () => {
    const client = fakeClient({
      scroll: vi.fn(async () => ({ points: [{ payload: { contentHash: "h1" } }, { payload: { contentHash: "h2" } }], next_page_offset: null })),
    });
    const out = await createQdrantStore(client as never, "c").existingHashes("d1");
    expect([...out].sort()).toEqual(["h1", "h2"]);
  });

  it("deleteByDocument filters by documentId", async () => {
    const client = fakeClient();
    await createQdrantStore(client as never, "c").deleteByDocument("d1");
    expect(client.delete).toHaveBeenCalledTimes(1);
    const arg = client.delete.mock.calls[0][1];
    expect(JSON.stringify(arg)).toContain("d1");
  });

  it("searchVector applies the allowlist as a documentId any-match filter", async () => {
    const client = fakeClient({ query: vi.fn(async () => ({ points: [] })) });
    await createQdrantStore(client as never, "c").searchVector([0.1], 5, ["d1", "d2"]);
    const args = client.query.mock.calls[0][1];
    expect(args.filter).toEqual({ must: [{ key: "documentId", match: { any: ["d1", "d2"] } }] });
  });

  it("searchVector([] allowlist) returns [] without querying", async () => {
    const client = fakeClient({ query: vi.fn(async () => ({ points: [] })) });
    const out = await createQdrantStore(client as never, "c").searchVector([0.1], 5, []);
    expect(out).toEqual([]);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("searchKeyword adds the allowlist alongside the content match", async () => {
    const client = fakeClient({ query: vi.fn(async () => ({ points: [] })) });
    await createQdrantStore(client as never, "c").searchKeyword("hello", [0.1], 5, ["d1"]);
    const args = client.query.mock.calls[0][1];
    expect(args.filter.must).toEqual(
      expect.arrayContaining([
        { key: "content", match: { text: "hello" } },
        { key: "documentId", match: { any: ["d1"] } },
      ]),
    );
  });

  it("searchKeyword([] allowlist) returns [] without querying", async () => {
    const client = fakeClient({ query: vi.fn(async () => ({ points: [] })) });
    const out = await createQdrantStore(client as never, "c").searchKeyword("hello", [0.1], 5, []);
    expect(out).toEqual([]);
    expect(client.query).not.toHaveBeenCalled();
  });
});
