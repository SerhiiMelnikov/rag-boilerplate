import weaviate, { type WeaviateClient } from "weaviate-client";
import { weaviateClient, WEAVIATE_COLLECTION } from "./client";

// Idempotently create the RagChunk class: no vectorizer (app supplies vectors),
// cosine distance, and the text/metadata properties the store reads.
//
// NOTE on the installed weaviate-client (v3.13.x) API shape: `vectorIndexConfig`
// is not a sibling of `vectorizers` on the collection-create config — it nests
// inside the `configure.vectorizer.none(...)` options instead.
export async function ensureWeaviateCollection(
  client?: WeaviateClient,
): Promise<void> {
  const c = client ?? (await weaviateClient());
  if (await c.collections.exists(WEAVIATE_COLLECTION)) return;
  await c.collections.create({
    name: WEAVIATE_COLLECTION,
    vectorizers: weaviate.configure.vectorizer.none({
      vectorIndexConfig: weaviate.configure.vectorIndex.hnsw({ distanceMetric: "cosine" }),
    }),
    properties: [
      { name: "documentId", dataType: weaviate.configure.dataType.TEXT },
      { name: "filename", dataType: weaviate.configure.dataType.TEXT },
      { name: "content", dataType: weaviate.configure.dataType.TEXT },
      { name: "contentHash", dataType: weaviate.configure.dataType.TEXT },
    ],
  });
}
