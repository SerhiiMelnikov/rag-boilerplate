import { chromaCollection } from "./client";

// Idempotently create the cosine chunk collection. getOrCreateCollection is
// itself idempotent, so this just forces creation ahead of the first ingest.
export async function ensureChromaCollection(
  getCollection: () => Promise<unknown> = chromaCollection,
): Promise<void> {
  await getCollection();
}
