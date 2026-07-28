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
  count: Mock;
}

function fakeClient(over: Partial<FakeQdrantClient> = {}): FakeQdrantClient {
  return {
    upsert: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
    query: vi.fn(async () => ({ points: [] })),
    scroll: vi.fn(async () => ({ points: [], next_page_offset: null })),
    count: vi.fn(async () => ({ count: 0 })),
    ...over,
  };
}

describe("qdrant store", () => {
  it("upsertChunks sends points with vector + payload (documentId, content, contentHash, filename)", async () => {
    const client = fakeClient();
    await createQdrantStore(client as never, "c").upsertChunks([
      { documentId: "d1", filename: "f.md", content: "hi", embedding: [0.1, 0.2], contentHash: "h1", chunkIndex: 1 },
    ]);
    expect(client.upsert).toHaveBeenCalledTimes(1);
    const arg = client.upsert.mock.calls[0][1];
    expect(arg.points[0].vector).toEqual([0.1, 0.2]);
    expect(arg.points[0].payload).toMatchObject({ documentId: "d1", content: "hi", contentHash: "h1", filename: "f.md", chunkIndex: 1 });
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

  it("listChunks pages forward across scroll cursors, sorts by chunkIndex nulls last, honours limit/offset, and uses the scrolled count as total once the whole document is scrolled", async () => {
    // Scroll's cursor order is arbitrary (point id order), not chunkIndex order —
    // point 3 (no chunkIndex — pre-Task-1 legacy chunk) surfaces before point 1.
    const scroll = vi.fn()
      .mockResolvedValueOnce({ points: [{ payload: { content: "c3", contentHash: "h3" } }], next_page_offset: "cursor-1" })
      .mockResolvedValueOnce({ points: [
        { payload: { content: "c1", contentHash: "h1", chunkIndex: 1 } },
        { payload: { content: "c0", contentHash: "h0", chunkIndex: 0 } },
      ], next_page_offset: null });
    const client = fakeClient({ scroll });
    const out = await createQdrantStore(client as never, "c").listChunks("d1", { limit: 2, offset: 0 });
    // Full document (3 chunks) fits within the window walked (offset+limit=2
    // needed, but scrolling doesn't stop mid-batch) — so total is the true
    // document size, not the page length, and no client.count call is needed.
    expect(out).toEqual({ rows: [
      { chunkIndex: 0, content: "c0", contentHash: "h0" },
      { chunkIndex: 1, content: "c1", contentHash: "h1" },
    ], total: 3 });
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll.mock.calls[1][1].offset).toBe("cursor-1");
    expect(client.count).not.toHaveBeenCalled();
  });

  it("listChunks falls back to client.count for total when it stops scrolling before the document is exhausted", async () => {
    const scroll = vi.fn(async () => ({
      points: [
        { payload: { content: "c0", contentHash: "h0", chunkIndex: 0 } },
        { payload: { content: "c1", contentHash: "h1", chunkIndex: 1 } },
      ],
      next_page_offset: "cursor-more", // more points exist beyond this page
    }));
    const count = vi.fn(async (_collection: string, _args: { filter?: unknown }) => ({ count: 500 }));
    const client = fakeClient({ scroll, count });
    const out = await createQdrantStore(client as never, "c").listChunks("d1", { limit: 2, offset: 0 });
    expect(out.rows).toEqual([
      { chunkIndex: 0, content: "c0", contentHash: "h0" },
      { chunkIndex: 1, content: "c1", contentHash: "h1" },
    ]);
    expect(out.total).toBe(500);
    // Already has offset+limit points and knows more exist — must not keep scrolling.
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledTimes(1);
    expect(count.mock.calls[0][1].filter).toEqual({ must: [{ key: "documentId", match: { value: "d1" } }] });
  });
});
