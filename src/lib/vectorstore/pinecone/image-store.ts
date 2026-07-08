import type { ImageVectorStore, ImageVectorInput, ImageMatch } from "../types";
import type { PineconeDenseLike } from "./store";
import { denseImageIndex } from "./client";

// Pinecone image vectors: a dedicated dense index, one record per image
// (id = imageId, values = caption embedding). Dense/cosine search only.
export function createPineconeImageStore(
  denseFn: () => PineconeDenseLike = () => denseImageIndex(),
): ImageVectorStore {
  return {
    async upsertImage(row: ImageVectorInput) {
      await denseFn().upsert([{ id: row.imageId, values: row.embedding, metadata: {} }]);
    },
    async searchImages(embedding: number[], limit: number): Promise<ImageMatch[]> {
      const res = await denseFn().query({ vector: embedding, topK: limit, includeMetadata: false });
      return (res.matches ?? []).map((m) => ({ imageId: m.id, score: typeof m.score === "number" ? m.score : 0 }));
    },
    async deleteImage(imageId: string) {
      await denseFn().deleteMany([imageId]);
    },
  };
}
