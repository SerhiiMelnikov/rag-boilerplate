import { describe, it, expect, vi } from "vitest";
import { searchImages } from "./search";
import type { ImageVectorStore } from "@/lib/vectorstore/types";
import type { ImageRepo } from "./repo";

const settings = { embeddingProvider: "google", embeddingModel: "gemini-embedding-2" } as never;

describe("searchImages", () => {
  it("embeds the query, filters by minScore, and joins metadata in score order", async () => {
    const store: ImageVectorStore = {
      upsertImage: vi.fn(),
      deleteImage: vi.fn(),
      searchImages: vi.fn(async () => [
        { imageId: "img-1", score: 0.9 },
        { imageId: "img-2", score: 0.2 }, // below threshold, dropped
      ]),
    };
    const repo = {
      getByIds: vi.fn(async () => [
        { id: "img-1", filename: "bike.png", caption: "a red bicycle", storageKey: "images/bike.png", contentType: "image/png" },
      ]),
    } as unknown as ImageRepo;

    const hits = await searchImages("red bike", { topN: 5, minScore: 0.3 }, {
      embed: async () => [0.1, 0.2],
      imageVectorStore: store, imageRepo: repo, settings,
    });

    expect(store.searchImages).toHaveBeenCalledWith([0.1, 0.2], 5);
    expect(hits).toEqual([{ imageId: "img-1", filename: "bike.png", caption: "a red bicycle", score: 0.9 }]);
  });

  it("returns [] when nothing clears the threshold", async () => {
    const store: ImageVectorStore = {
      upsertImage: vi.fn(), deleteImage: vi.fn(),
      searchImages: vi.fn(async () => [{ imageId: "img-1", score: 0.1 }]),
    };
    const repo = { getByIds: vi.fn(async () => []) } as unknown as ImageRepo;
    const hits = await searchImages("x", { topN: 5, minScore: 0.3 }, { embed: async () => [0.1], imageVectorStore: store, imageRepo: repo, settings });
    expect(hits).toEqual([]);
    expect(repo.getByIds).not.toHaveBeenCalled();
  });
});
