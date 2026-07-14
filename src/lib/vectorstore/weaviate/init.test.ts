import { describe, it, expect, vi } from "vitest";
import { ensureWeaviateCollection } from "./init";

// Deliberate: the real param type is the full WeaviateClient; this fake only
// implements the two calls ensureWeaviateCollection makes. `never` (not `any`)
// bridges it at each call site below.
function fakeClient(exists: boolean) {
  return {
    collections: {
      exists: vi.fn(async () => exists),
      create: vi.fn(async (_cfg: { name: string }) => ({})),
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

  it("is a no-op when the class already exists", async () => {
    const client = fakeClient(true);
    await ensureWeaviateCollection(client as never);
    expect(client.collections.create).not.toHaveBeenCalled();
  });
});
