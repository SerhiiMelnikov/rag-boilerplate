import type { VectorStore, DocumentRepo, ImageVectorStore } from "./types";
import { createPgVectorStore } from "./pgvector/store";
import { createQdrantStore } from "./qdrant/store";
import { createChromaStore } from "./chroma/store";
import { createWeaviateStore } from "./weaviate/store";
import { createPineconeStore } from "./pinecone/store";
import { createDocumentRepo } from "./document-repo";
import { createPgImageStore } from "./pgvector/image-store";
import { createQdrantImageStore } from "./qdrant/image-store";
import { createChromaImageStore } from "./chroma/image-store";
import { createWeaviateImageStore } from "./weaviate/image-store";
import { createPineconeImageStore } from "./pinecone/image-store";

let store: VectorStore | null = null;
let repo: DocumentRepo | null = null;
let imageStore: ImageVectorStore | null = null;

function build(): VectorStore {
  const kind = process.env.VECTOR_STORE ?? "pgvector";
  switch (kind) {
    case "pgvector":
      return createPgVectorStore();
    case "qdrant":
      return createQdrantStore();
    case "chroma":
      return createChromaStore();
    case "weaviate":
      return createWeaviateStore();
    case "pinecone":
      return createPineconeStore();
    default:
      throw new Error(`unknown VECTOR_STORE "${kind}" — expected "pgvector", "qdrant", "chroma", "weaviate", or "pinecone".`);
  }
}

// Adapter selected once by the VECTOR_STORE env (default pgvector), memoized.
export function getVectorStore(): VectorStore {
  if (!store) store = build();
  return store;
}

// Document metadata repo (always Postgres), memoized.
export function getDocumentRepo(): DocumentRepo {
  if (!repo) repo = createDocumentRepo();
  return repo;
}

function buildImageStore(): ImageVectorStore {
  const kind = process.env.VECTOR_STORE ?? "pgvector";
  switch (kind) {
    case "pgvector":
      return createPgImageStore();
    case "qdrant":
      return createQdrantImageStore();
    case "chroma":
      return createChromaImageStore();
    case "weaviate":
      return createWeaviateImageStore();
    case "pinecone":
      return createPineconeImageStore();
    default:
      throw new Error(`image vector store not implemented for VECTOR_STORE="${kind}".`);
  }
}

// Image-vector adapter selected by VECTOR_STORE (default pgvector), memoized.
export function getImageVectorStore(): ImageVectorStore {
  if (!imageStore) imageStore = buildImageStore();
  return imageStore;
}

// Test hook: clear the memoized singletons so a test can switch VECTOR_STORE.
export function resetVectorStoreForTests(): void {
  store = null;
  repo = null;
  imageStore = null;
}
