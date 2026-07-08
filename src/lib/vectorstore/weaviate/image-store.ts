import type { ImageVectorStore, ImageVectorInput, ImageMatch } from "../types";
import { weaviateImageCollection } from "./client";

export interface WeaviateImageObject { uuid: string; metadata?: { distance?: number } | null; }
export interface WeaviateImageCollectionLike {
  data: {
    insert(obj: { id: string; vectors: number[] }): Promise<unknown>;
    deleteById(id: string): Promise<unknown>;
  };
  query: {
    nearVector(vector: number[], args: { limit: number; returnMetadata?: string[] }): Promise<{ objects: WeaviateImageObject[] }>;
  };
}

// See weaviate chunk store for why the real Collection<T> type is narrowed via cast.
const defaultGetImageCollection = weaviateImageCollection as unknown as () => Promise<WeaviateImageCollectionLike>;

// Weaviate image vectors: objects in the RagImage class, uuid = imageId, no
// properties. score = 1 - cosine distance.
export function createWeaviateImageStore(
  getCollection: () => Promise<WeaviateImageCollectionLike> = defaultGetImageCollection,
): ImageVectorStore {
  return {
    async upsertImage(row: ImageVectorInput) {
      const col = await getCollection();
      await col.data.insert({ id: row.imageId, vectors: row.embedding });
    },
    async searchImages(embedding: number[], limit: number): Promise<ImageMatch[]> {
      const col = await getCollection();
      const res = await col.query.nearVector(embedding, { limit, returnMetadata: ["distance"] });
      return res.objects.map((o) => ({ imageId: o.uuid, score: 1 - (o.metadata?.distance ?? 1) }));
    },
    async deleteImage(imageId: string) {
      const col = await getCollection();
      await col.data.deleteById(imageId);
    },
  };
}
