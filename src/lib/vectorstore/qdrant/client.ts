import { QdrantClient } from "@qdrant/js-client-rest";

// Single collection holding all chunks as points.
export const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || "rag_chunks";

let client: QdrantClient | null = null;

// Lazily construct the REST client from QDRANT_URL (throws a clear error if unset).
export function qdrantClient(): QdrantClient {
  if (!client) {
    const url = process.env.QDRANT_URL;
    if (!url) throw new Error("QDRANT_URL is required when VECTOR_STORE=qdrant.");
    client = new QdrantClient({ url, apiKey: process.env.QDRANT_API_KEY });
  }
  return client;
}
