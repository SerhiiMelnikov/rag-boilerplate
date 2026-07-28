import weaviate, { type WeaviateClient } from "weaviate-client";
import { weaviateClient, WEAVIATE_COLLECTION, WEAVIATE_IMAGE_COLLECTION } from "./client";

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
  if (await c.collections.exists(WEAVIATE_COLLECTION)) {
    // An install upgraded from before chunk inspection existed kept whatever
    // schema it was created with — Weaviate's auto-schema only adds a property
    // when an object carrying it is *written*, and this early-return means
    // that write never happens. Without chunkIndex in the schema, every one of
    // listChunks' chunkIndex-based calls (the `>= 0` aggregate, the
    // `returnProperties: [..., "chunkIndex"]` fetch, and
    // `sort.byProperty("chunkIndex")`) is rejected outright with "no such prop
    // with name 'chunkIndex' found in class" — live-verified against a
    // collection created with only the old four properties — so every
    // upgraded install 500s on chunk preview until someone happens to
    // re-ingest a document. Backfill the property here so an upgrade alone is
    // enough. Guarded by the existence check (rather than calling
    // `addProperty` unconditionally) because Weaviate rejects re-adding a
    // property that's already there.
    const collection = c.collections.get(WEAVIATE_COLLECTION);
    const existing = await collection.config.get();
    if (!existing.properties.some((p) => p.name === "chunkIndex")) {
      await collection.config.addProperty({ name: "chunkIndex", dataType: weaviate.configure.dataType.INT });
    }
    return;
  }
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
      { name: "chunkIndex", dataType: weaviate.configure.dataType.INT },
    ],
  });
}

// RagImage class: no vectorizer (app supplies vectors), cosine, no properties
// (uuid = imageId; metadata lives in Postgres).
export async function ensureWeaviateImageCollection(client?: WeaviateClient): Promise<void> {
  const c = client ?? (await weaviateClient());
  if (await c.collections.exists(WEAVIATE_IMAGE_COLLECTION)) return;
  await c.collections.create({
    name: WEAVIATE_IMAGE_COLLECTION,
    vectorizers: weaviate.configure.vectorizer.none({
      vectorIndexConfig: weaviate.configure.vectorIndex.hnsw({ distanceMetric: "cosine" }),
    }),
  });
}
