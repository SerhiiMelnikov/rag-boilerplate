import type { QdrantClient } from "@qdrant/js-client-rest";
import { EMBEDDING_DIMENSIONS } from "@/lib/providers/embedding";
import { qdrantClient, QDRANT_COLLECTION, QDRANT_IMAGE_COLLECTION } from "./client";

// Idempotently create the chunk collection (Cosine, size = EMBEDDING_DIMENSIONS)
// and the full-text payload index on `content` that searchKeyword needs.
export async function ensureQdrantCollection(
  client: QdrantClient = qdrantClient(),
  collection = QDRANT_COLLECTION,
): Promise<void> {
  const { collections } = await client.getCollections();
  if (collections.some((c) => c.name === collection)) return;

  await client.createCollection(collection, {
    vectors: { size: EMBEDDING_DIMENSIONS, distance: "Cosine" },
  });
  await client.createPayloadIndex(collection, {
    field_name: "content",
    field_schema: "text",
  });
}

// Image collection: same Cosine/size as chunks, no payload text index needed.
export async function ensureQdrantImageCollection(
  client: QdrantClient = qdrantClient(),
  collection = QDRANT_IMAGE_COLLECTION,
): Promise<void> {
  const { collections } = await client.getCollections();
  if (collections.some((c) => c.name === collection)) return;
  await client.createCollection(collection, { vectors: { size: EMBEDDING_DIMENSIONS, distance: "Cosine" } });
}
