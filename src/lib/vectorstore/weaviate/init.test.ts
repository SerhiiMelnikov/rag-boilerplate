import { describe, it, expect, vi } from "vitest";
import { ensureWeaviateCollection } from "./init";

// Deliberate: the real param type is the full WeaviateClient; this fake only
// implements the calls ensureWeaviateCollection makes. `never` (not `any`)
// bridges it at each call site below. `existingProperties` simulates the
// schema an already-created collection has (e.g. a pre-0.5.6 install that
// predates chunkIndex).
function fakeClient(exists: boolean, existingProperties: string[] = []) {
  const configGet = vi.fn(async () => ({ properties: existingProperties.map((name) => ({ name })) }));
  const configAddProperty = vi.fn(async (_prop: { name: string; dataType: unknown }) => {});
  return {
    collections: {
      exists: vi.fn(async () => exists),
      create: vi.fn(async (_cfg: { name: string }) => ({})),
      get: vi.fn((_name: string) => ({ config: { get: configGet, addProperty: configAddProperty } })),
    },
  };
}

describe("ensureWeaviateCollection", () => {
  it("creates the class when missing", async () => {
    const client = fakeClient(false);
    await ensureWeaviateCollection(client as never);
    expect(client.collections.create).toHaveBeenCalledTimes(1);
    const cfg = client.collections.create.mock.calls[0][0];
    expect(cfg.name).toBe("RagChunk");
  });

  it("is a no-op when the class already exists and already has chunkIndex", async () => {
    const client = fakeClient(true, ["documentId", "filename", "content", "contentHash", "chunkIndex"]);
    await ensureWeaviateCollection(client as never);
    expect(client.collections.create).not.toHaveBeenCalled();
    const collectionHandle = client.collections.get.mock.results[0].value;
    expect(collectionHandle.config.addProperty).not.toHaveBeenCalled();
  });

  // The bug this guards: an upgraded install's RagChunk class was created
  // before chunkIndex existed, and auto-schema never adds it (it only adds a
  // property when an object carrying it is *written*, which the old
  // early-return never triggered) — so listChunks' chunkIndex-based calls
  // 500 with "no such prop with name 'chunkIndex' found in class" on every
  // upgraded install until someone re-ingests. Live-verified against a real
  // Weaviate instance (see task report) that this backfills the property and
  // listChunks then succeeds.
  it("backfills the chunkIndex property onto an existing pre-chunk-inspection collection that lacks it", async () => {
    const client = fakeClient(true, ["documentId", "filename", "content", "contentHash"]);
    await ensureWeaviateCollection(client as never);
    expect(client.collections.create).not.toHaveBeenCalled();
    const collectionHandle = client.collections.get.mock.results[0].value;
    expect(collectionHandle.config.addProperty).toHaveBeenCalledTimes(1);
    expect(collectionHandle.config.addProperty).toHaveBeenCalledWith(expect.objectContaining({ name: "chunkIndex" }));
  });
});
