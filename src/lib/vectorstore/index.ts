import type { VectorStore, DocumentRepo } from "./types";
import { createPgVectorStore } from "./pgvector/store";
import { createQdrantStore } from "./qdrant/store";
import { createChromaStore } from "./chroma/store";
import { createDocumentRepo } from "./document-repo";

let store: VectorStore | null = null;
let repo: DocumentRepo | null = null;

function build(): VectorStore {
  const kind = process.env.VECTOR_STORE ?? "pgvector";
  switch (kind) {
    case "pgvector":
      return createPgVectorStore();
    case "qdrant":
      return createQdrantStore();
    case "chroma":
      return createChromaStore();
    default:
      throw new Error(`unknown VECTOR_STORE "${kind}" — expected "pgvector", "qdrant", or "chroma".`);
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

// Test hook: clear the memoized singletons so a test can switch VECTOR_STORE.
export function resetVectorStoreForTests(): void {
  store = null;
  repo = null;
}
