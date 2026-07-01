import { describe, it, expect, vi } from "vitest";
import { ensureQdrantCollection } from "./init";

function fakeClient(exists: boolean) {
  return {
    getCollections: vi.fn(async () => ({ collections: exists ? [{ name: "rag_chunks" }] : [] })),
    createCollection: vi.fn(async () => ({})),
    createPayloadIndex: vi.fn(async () => ({})),
  } as any;
}

describe("ensureQdrantCollection", () => {
  it("creates the collection + full-text index when missing", async () => {
    const client = fakeClient(false);
    await ensureQdrantCollection(client, "rag_chunks");
    expect(client.createCollection).toHaveBeenCalledTimes(1);
    const [, cfg] = client.createCollection.mock.calls[0];
    expect(cfg.vectors.size).toBe(768);
    expect(cfg.vectors.distance).toBe("Cosine");
    expect(client.createPayloadIndex).toHaveBeenCalled(); // content text index
  });

  it("is a no-op when the collection already exists", async () => {
    const client = fakeClient(true);
    await ensureQdrantCollection(client, "rag_chunks");
    expect(client.createCollection).not.toHaveBeenCalled();
  });
});
