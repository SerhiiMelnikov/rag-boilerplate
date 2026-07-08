import { describe, it, expect, vi } from "vitest";
import { createWeaviateImageStore } from "./image-store";

describe("createWeaviateImageStore", () => {
  it("inserts with uuid=imageId; maps nearVector distance to cosine score", async () => {
    const col = {
      data: { insert: vi.fn(async () => ({})), deleteById: vi.fn(async () => ({})) },
      query: { nearVector: vi.fn(async () => ({ objects: [{ uuid: "img-1", metadata: { distance: 0.25 } }] })) },
    };
    const store = createWeaviateImageStore(async () => col);
    await store.upsertImage({ imageId: "img-1", embedding: [0.1, 0.2] });
    // upsert is delete-then-insert, since Weaviate's `data.insert` is create-only.
    expect(col.data.deleteById).toHaveBeenCalledWith("img-1");
    expect(col.data.insert).toHaveBeenCalledWith({ id: "img-1", vectors: [0.1, 0.2] });
    const hits = await store.searchImages([0.1, 0.2], 3);
    expect(hits).toEqual([{ imageId: "img-1", score: expect.closeTo(0.75, 5) }]);
  });
});
