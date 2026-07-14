import { describe, it, expect, vi } from "vitest";
import { ensureQdrantCollection } from "./init";

// Deliberate: QdrantClient (the real param type) is the full third-party SDK
// client; this fake only implements the three calls ensureQdrantCollection
// makes. `never` (not `any`) bridges it at each call site below.
function fakeClient(exists: boolean) {
  return {
    getCollections: vi.fn(async () => ({ collections: exists ? [{ name: "rag_chunks" }] : [] })),
    createCollection: vi.fn(async (_collection: string, _config: { vectors: { size: number; distance: string } }) => ({})),
    createPayloadIndex: vi.fn(async (_collection: string, _config: { field_name: string; field_schema: string }) => ({})),
  };
}

describe("ensureQdrantCollection", () => {
  it("creates the collection + full-text index when missing", async () => {
    const client = fakeClient(false);
    await ensureQdrantCollection(client as never, "rag_chunks");
    expect(client.createCollection).toHaveBeenCalledTimes(1);
    const [, cfg] = client.createCollection.mock.calls[0];
    expect(cfg.vectors.size).toBe(768);
    expect(cfg.vectors.distance).toBe("Cosine");
    expect(client.createPayloadIndex).toHaveBeenCalled(); // content text index
  });

  it("is a no-op when the collection already exists", async () => {
    const client = fakeClient(true);
    await ensureQdrantCollection(client as never, "rag_chunks");
    expect(client.createCollection).not.toHaveBeenCalled();
  });
});
