import { describe, it, expect, vi } from "vitest";
import { ensureWeaviateCollection } from "./init";

function fakeClient(exists: boolean) {
  return {
    collections: {
      exists: vi.fn(async () => exists),
      create: vi.fn(async () => ({})),
    },
  } as any;
}

describe("ensureWeaviateCollection", () => {
  it("creates the class when missing", async () => {
    const client = fakeClient(false);
    await ensureWeaviateCollection(client);
    expect(client.collections.create).toHaveBeenCalledTimes(1);
    const cfg = client.collections.create.mock.calls[0][0];
    expect(cfg.name).toBe("RagChunk");
  });

  it("is a no-op when the class already exists", async () => {
    const client = fakeClient(true);
    await ensureWeaviateCollection(client);
    expect(client.collections.create).not.toHaveBeenCalled();
  });
});
