import { Pinecone } from "@pinecone-database/pinecone";

// Two serverless indexes: dense (app-supplied 768 vectors, cosine) and sparse
// (Pinecone-hosted sparse model over text) for keyword search.
export const PINECONE_DENSE_INDEX = process.env.PINECONE_DENSE_INDEX || "rag-chunks-dense";
export const PINECONE_SPARSE_INDEX = process.env.PINECONE_SPARSE_INDEX || "rag-chunks-sparse";

let clientSingleton: Pinecone | null = null;

// Lazily construct the client from PINECONE_API_KEY (throws a clear error if unset).
export function pineconeClient(): Pinecone {
  if (!clientSingleton) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) throw new Error("PINECONE_API_KEY is required when VECTOR_STORE=pinecone.");
    clientSingleton = new Pinecone({ apiKey });
  }
  return clientSingleton;
}

export function denseIndex() {
  return pineconeClient().index(PINECONE_DENSE_INDEX);
}
export function sparseIndex() {
  return pineconeClient().index(PINECONE_SPARSE_INDEX);
}
