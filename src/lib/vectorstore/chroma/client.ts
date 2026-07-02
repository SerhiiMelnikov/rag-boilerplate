import { ChromaClient } from "chromadb";

// Single collection holding all chunks.
export const CHROMA_COLLECTION = process.env.CHROMA_COLLECTION || "rag_chunks";

let clientSingleton: ChromaClient | null = null;

// Lazily construct the HTTP client from CHROMA_URL (throws a clear error if unset).
function client(): ChromaClient {
  if (!clientSingleton) {
    const url = process.env.CHROMA_URL;
    if (!url) throw new Error("CHROMA_URL is required when VECTOR_STORE=chroma.");
    clientSingleton = new ChromaClient({ path: url });
  }
  return clientSingleton;
}

// We always pass embeddings/queryEmbeddings explicitly, so the collection needs
// no server-side embedding function. This stub satisfies the client API and
// throws if ever invoked — a signal that a code path forgot to pass vectors.
const noEmbeddingFunction = {
  generate: async (_texts: string[]): Promise<number[][]> => {
    throw new Error("Chroma embeddingFunction should never run — embeddings are supplied by the app.");
  },
};

// Lazily get-or-create the cosine chunk collection and return the handle.
export async function chromaCollection() {
  return client().getOrCreateCollection({
    name: CHROMA_COLLECTION,
    metadata: { "hnsw:space": "cosine" },
    embeddingFunction: noEmbeddingFunction as never,
  });
}
