import { describe, it, expect, vi } from "vitest";
import { createChromaImageStore } from "./image-store";

describe("createChromaImageStore", () => {
  it("upserts by imageId and maps query distances to cosine scores", async () => {
    const col = {
      upsert: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
      query: vi.fn(async () => ({ ids: [["img-1"]], distances: [[0.2]] })),
    };
    const store = createChromaImageStore(async () => col);
    await store.upsertImage({ imageId: "img-1", embedding: [0.1, 0.2] });
    expect(col.upsert).toHaveBeenCalledWith({ ids: ["img-1"], embeddings: [[0.1, 0.2]] });
    const hits = await store.searchImages([0.1, 0.2], 3);
    expect(hits).toEqual([{ imageId: "img-1", score: expect.closeTo(0.8, 5) }]);
  });
});
