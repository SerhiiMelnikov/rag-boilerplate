import weaviate, { type WeaviateClient } from "weaviate-client";

// Single collection (class) holding all chunks. Weaviate class names are
// capitalized by convention.
export const WEAVIATE_COLLECTION = process.env.WEAVIATE_COLLECTION || "RagChunk";
export const WEAVIATE_IMAGE_COLLECTION = process.env.WEAVIATE_IMAGE_COLLECTION || "RagImage";

let clientPromise: Promise<WeaviateClient> | null = null;

// Lazily connect from WEAVIATE_URL (http host+port) + gRPC (default 50051).
export function weaviateClient(): Promise<WeaviateClient> {
  if (!clientPromise) {
    const raw = process.env.WEAVIATE_URL;
    if (!raw) throw new Error("WEAVIATE_URL is required when VECTOR_STORE=weaviate.");
    const url = new URL(raw);
    const grpcPort = Number(process.env.WEAVIATE_GRPC_PORT || 50051);
    clientPromise = weaviate.connectToCustom({
      httpHost: url.hostname,
      httpPort: Number(url.port || 8080),
      httpSecure: url.protocol === "https:",
      grpcHost: url.hostname,
      grpcPort,
      grpcSecure: url.protocol === "https:",
    });
  }
  return clientPromise;
}

// Return the typed collection handle used by the store.
export async function weaviateCollection() {
  const client = await weaviateClient();
  return client.collections.get(WEAVIATE_COLLECTION);
}

// Return the typed collection handle for the image-vector class.
export async function weaviateImageCollection() {
  const client = await weaviateClient();
  return client.collections.get(WEAVIATE_IMAGE_COLLECTION);
}
