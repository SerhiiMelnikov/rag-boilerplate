import type { ImageVectorStore, ImageVectorInput, ImageMatch } from "../types";
import { chromaImageCollection } from "./client";

// Minimal shape of the image collection this adapter uses.
export interface ChromaImageCollectionLike {
  upsert(args: { ids: string[]; embeddings: number[][] }): Promise<unknown>;
  delete(args: { ids?: string[] }): Promise<unknown>;
  query(args: { queryEmbeddings: number[][]; nResults: number }): Promise<{ ids: string[][]; distances: (number | null)[][] }>;
}

// Chroma image vectors: a second collection, one record per image (id = imageId,
// embedding). score = 1 - cosine distance (collection created with hnsw:space=cosine).
export function createChromaImageStore(
  getCollection: () => Promise<ChromaImageCollectionLike> = chromaImageCollection,
): ImageVectorStore {
  return {
    async upsertImage(row: ImageVectorInput) {
      const col = await getCollection();
      await col.upsert({ ids: [row.imageId], embeddings: [row.embedding] });
    },
    async searchImages(embedding: number[], limit: number): Promise<ImageMatch[]> {
      const col = await getCollection();
      const res = await col.query({ queryEmbeddings: [embedding], nResults: limit });
      const ids = res.ids[0] ?? [];
      return ids.map((id, i) => {
        const dist = res.distances[0]?.[i];
        return { imageId: id, score: typeof dist === "number" ? 1 - dist : 0 };
      });
    },
    async deleteImage(imageId: string) {
      const col = await getCollection();
      await col.delete({ ids: [imageId] });
    },
  };
}
