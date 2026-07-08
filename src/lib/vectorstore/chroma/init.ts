import { chromaCollection, chromaImageCollection } from "./client";

// Idempotently create the cosine chunk collection. getOrCreateCollection is
// itself idempotent, so this just forces creation ahead of the first ingest.
export async function ensureChromaCollection(
  getCollection: () => Promise<unknown> = chromaCollection,
): Promise<void> {
  await getCollection();
}

// Idempotently create the cosine image collection.
export async function ensureChromaImageCollection(
  getCollection: () => Promise<unknown> = chromaImageCollection,
): Promise<void> {
  await getCollection();
}
