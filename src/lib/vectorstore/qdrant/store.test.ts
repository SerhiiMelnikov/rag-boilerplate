import { describe, it, expect, vi, type Mock } from "vitest";
import type { QdrantClient } from "@qdrant/js-client-rest";
import { createQdrantStore } from "./store";

// QdrantClient["upsert"]'s parameter type is a batch-or-list union
// (Schemas.PointInsertOperations) that doesn't narrow at the `arg.points`
// assertion below, and its return type (Schemas.UpdateResult) requires a
// `status` field the store never reads. Hand-written from the actual call
// site in store.ts — `client.upsert(collection, { wait, points })` always
// uses the "points" list variant, never the "batch" one.
type FakeUpsert = (
  collectionName: string,
  args: { wait?: boolean; points: { id: string | number; vector: number[]; payload?: Record<string, unknown> }[] },
) => Promise<{ status: string }>;

// Deliberate: QdrantClient (the real param type) is the full third-party SDK
// client; this fake only implements the five calls the store actually makes.
// `never` (not `any`) bridges it at each call site below.
interface FakeQdrantClient {
  upsert: Mock<FakeUpsert>;
  delete: Mock<QdrantClient["delete"]>;
  query: Mock<QdrantClient["query"]>;
  scroll: Mock<QdrantClient["scroll"]>;
  count: Mock<QdrantClient["count"]>;
}

function fakeClient(over: Partial<FakeQdrantClient> = {}): FakeQdrantClient {
  return {
    upsert: vi.fn(async () => ({ status: "completed" as const })),
    delete: vi.fn(async () => ({ status: "completed" as const })),
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
        // version is required by the real ScoredPoint type but unused by toChunk.
        { id: "p1", version: 1, score: 0.87, payload: { documentId: "d1", content: "hi", filename: "f.md", contentHash: "h1" } },
      ] })),
    });
    const out = await createQdrantStore(client as never, "c").searchVector([0.1], 5);
    expect(out).toEqual([{ chunkId: "p1", documentId: "d1", filename: "f.md", content: "hi", score: 0.87 }]);
  });

  it("existingHashes scrolls by documentId and collects contentHash", async () => {
    const client = fakeClient({
      // id is required by the real Record (point) type but unused by existingHashes.
      scroll: vi.fn(async () => ({ points: [{ id: "p1", payload: { contentHash: "h1" } }, { id: "p2", payload: { contentHash: "h2" } }], next_page_offset: null })),
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
    // filter is optional on the real query() args type; this call site always
    // supplies one, so `?.` merely satisfies that without loosening the check.
    expect(args.filter?.must).toEqual(
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

  it("listChunks pages forward across scroll cursors, sorts by chunkIndex nulls last, honours limit/offset, and total is the full scrolled count", async () => {
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
    // total is the true document size (3), not the page length (2).
    expect(out).toEqual({ rows: [
      { chunkIndex: 0, content: "c0", contentHash: "h0" },
      { chunkIndex: 1, content: "c1", contentHash: "h1" },
    ], total: 3 });
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll.mock.calls[1][1].offset).toBe("cursor-1");
  });

  it("listChunks enumerates every scroll batch before sorting/slicing — an early page must not leak an arbitrary scroll-order window", async () => {
    // 300 chunks, returned across two scroll batches (the implementation's
    // batch size is 256) in an order unrelated to chunkIndex — here, strictly
    // descending (opposite of insertion order), reproducing a real point-id
    // scroll order having nothing to do with chunkIndex. An early-stop
    // implementation that quits as soon as it's collected offset+limit points
    // would see only batch 1 (chunkIndex 299..44) and never reach the chunks
    // that actually belong at the front of the document (0..9).
    const toPoint = (idx: number) => ({ payload: { content: `c${idx}`, contentHash: `h${idx}`, chunkIndex: idx } });
    const batch1 = Array.from({ length: 256 }, (_, i) => 299 - i); // 299..44, descending
    const batch2 = Array.from({ length: 44 }, (_, i) => 43 - i); // 43..0, descending
    const scroll = vi.fn()
      .mockResolvedValueOnce({ points: batch1.map(toPoint), next_page_offset: "cursor-2" })
      .mockResolvedValueOnce({ points: batch2.map(toPoint), next_page_offset: null });
    const client = fakeClient({ scroll });
    const out = await createQdrantStore(client as never, "c").listChunks("d1", { limit: 10, offset: 0 });
    expect(out.total).toBe(300);
    expect(out.rows.map((r) => r.chunkIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // Both batches were walked — scrolling did not stop after the first.
    expect(scroll).toHaveBeenCalledTimes(2);
  });
});
