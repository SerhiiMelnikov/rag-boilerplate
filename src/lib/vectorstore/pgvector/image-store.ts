import { sql, cosineDistance, gt, desc, eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { imageVectors } from "@/lib/db/schema";
import type { ImageVectorStore, ImageVectorInput, ImageMatch } from "../types";

// pgvector-backed image vectors. One row per image in `image_vectors`.
export function createPgImageStore(db = defaultDb): ImageVectorStore {
  return {
    async upsertImage(row: ImageVectorInput) {
      await db
        .insert(imageVectors)
        .values({ imageId: row.imageId, embedding: row.embedding })
        .onConflictDoUpdate({ target: imageVectors.imageId, set: { embedding: row.embedding } });
    },

    async searchImages(embedding: number[], limit: number): Promise<ImageMatch[]> {
      const similarity = sql<number>`1 - (${cosineDistance(imageVectors.embedding, embedding)})`;
      const rows = await db
        .select({ imageId: imageVectors.imageId, score: similarity })
        .from(imageVectors)
        .where(gt(similarity, 0))
        .orderBy((t) => desc(t.score))
        .limit(limit);
      return rows.map((r) => ({ imageId: r.imageId, score: r.score }));
    },

    async deleteImage(imageId: string) {
      await db.delete(imageVectors).where(eq(imageVectors.imageId, imageId));
    },
  };
}
