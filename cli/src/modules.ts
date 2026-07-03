import type { ProviderId, VectorStoreId } from "./options";

export interface ProviderModule {
  id: ProviderId;
  label: string;
  file: string;
  dep: string | null; // null = shares another provider's dep (ollama → openai)
  supportsEmbedding: boolean;
  defaultChatModel: string;
  defaultEmbeddingModel: string | null;
  defaultVisionModel: string;
}

export interface VectorStoreModule {
  id: VectorStoreId;
  label: string;
  dir: string | null;
  deps: string[];
  dockerService: string | null;
  dockerVolume: string | null;
  envHeader: string | null; // substring identifying its block header in .env.example
  initNeeded: boolean;
}

// Default model ids are sensible, currently-available defaults; the admin can
// change any of them at runtime in Settings. EMBEDDING_DIMENSIONS stays 768:
// openai text-embedding-3-small is requested at 768 dims by the adapter, and
// ollama nomic-embed-text is natively 768.
export const PROVIDERS: Record<ProviderId, ProviderModule> = {
  google: {
    id: "google", label: "Google Gemini", file: "src/lib/providers/google.ts",
    dep: "@ai-sdk/google", supportsEmbedding: true,
    defaultChatModel: "gemma-4-31b-it", defaultEmbeddingModel: "gemini-embedding-2", defaultVisionModel: "gemini-2.5-flash",
  },
  openai: {
    id: "openai", label: "OpenAI", file: "src/lib/providers/openai.ts",
    dep: "@ai-sdk/openai", supportsEmbedding: true,
    defaultChatModel: "gpt-4o-mini", defaultEmbeddingModel: "text-embedding-3-small", defaultVisionModel: "gpt-4o-mini",
  },
  anthropic: {
    id: "anthropic", label: "Anthropic Claude", file: "src/lib/providers/anthropic.ts",
    dep: "@ai-sdk/anthropic", supportsEmbedding: false,
    defaultChatModel: "claude-3-5-sonnet-latest", defaultEmbeddingModel: null, defaultVisionModel: "claude-3-5-sonnet-latest",
  },
  ollama: {
    id: "ollama", label: "Ollama (local)", file: "src/lib/providers/ollama.ts",
    dep: null, supportsEmbedding: true,
    defaultChatModel: "llama3.1", defaultEmbeddingModel: "nomic-embed-text", defaultVisionModel: "llava",
  },
};

export const VECTOR_STORES: Record<VectorStoreId, VectorStoreModule> = {
  pgvector: { id: "pgvector", label: "pgvector (Postgres)", dir: "src/lib/vectorstore/pgvector", deps: [], dockerService: null, dockerVolume: null, envHeader: null, initNeeded: false },
  qdrant: { id: "qdrant", label: "Qdrant", dir: "src/lib/vectorstore/qdrant", deps: ["@qdrant/js-client-rest"], dockerService: "qdrant", dockerVolume: "rag_qdrant", envHeader: "Qdrant", initNeeded: true },
  chroma: { id: "chroma", label: "Chroma", dir: "src/lib/vectorstore/chroma", deps: ["chromadb"], dockerService: "chroma", dockerVolume: "rag_chroma", envHeader: "Chroma", initNeeded: true },
  weaviate: { id: "weaviate", label: "Weaviate", dir: "src/lib/vectorstore/weaviate", deps: ["weaviate-client"], dockerService: "weaviate", dockerVolume: "rag_weaviate", envHeader: "Weaviate", initNeeded: true },
  pinecone: { id: "pinecone", label: "Pinecone (managed)", dir: "src/lib/vectorstore/pinecone", deps: ["@pinecone-database/pinecone"], dockerService: null, dockerVolume: null, envHeader: "Pinecone", initNeeded: true },
};

// Provider deps to remove for a given kept set. @ai-sdk/openai stays if either
// openai OR ollama is kept (ollama reuses the OpenAI adapter).
export function providerDepsToRemove(kept: ProviderId[]): string[] {
  const keptSet = new Set(kept);
  const remove: string[] = [];
  for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
    const mod = PROVIDERS[id];
    if (!mod.dep) continue;
    if (keptSet.has(id)) continue;
    if (mod.dep === "@ai-sdk/openai" && keptSet.has("ollama")) continue; // shared
    remove.push(mod.dep);
  }
  return remove;
}
