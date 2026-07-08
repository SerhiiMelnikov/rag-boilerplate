import type { QdrantClient } from "@qdrant/js-client-rest";
import type { ImageVectorStore, ImageVectorInput, ImageMatch } from "../types";
import { qdrantClient, QDRANT_IMAGE_COLLECTION } from "./client";

// Qdrant image vectors: a second collection, one point per image (id = imageId,
// vector = caption embedding, no payload). Dense search only.
export function createQdrantImageStore(
  client: QdrantClient = qdrantClient(),
  collection = QDRANT_IMAGE_COLLECTION,
): ImageVectorStore {
  return {
    async upsertImage(row: ImageVectorInput) {
      await client.upsert(collection, { wait: true, points: [{ id: row.imageId, vector: row.embedding }] });
    },
    async searchImages(embedding: number[], limit: number): Promise<ImageMatch[]> {
      const res = await client.query(collection, { query: embedding, limit });
      return (res.points as { id: string | number; score?: number }[]).map((p) => ({
        imageId: String(p.id),
        score: typeof p.score === "number" ? p.score : 0,
      }));
    },
    async deleteImage(imageId: string) {
      await client.delete(collection, { wait: true, points: [imageId] });
    },
  };
}
