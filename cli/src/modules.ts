import type { ProviderId, VectorStoreId } from "./options.js";

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
  // Env vars to override on the compose `app` service so it addresses this
  // store by its in-network service name instead of the `localhost` URL
  // generateEnv() writes into .env (correct for `npm run dev` on the host,
  // wrong inside the app container, where localhost is the container itself).
  // null for stores with no docker-compose service of their own: pgvector
  // (lives in Postgres — DATABASE_URL already covers it) and pinecone
  // (managed, reached over the internet via PINECONE_API_KEY).
  appEnvOverrides: Record<string, string> | null;
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
  pgvector: { id: "pgvector", label: "pgvector (Postgres)", dir: "src/lib/vectorstore/pgvector", deps: [], dockerService: null, dockerVolume: null, envHeader: null, initNeeded: false, appEnvOverrides: null },
  qdrant: { id: "qdrant", label: "Qdrant", dir: "src/lib/vectorstore/qdrant", deps: ["@qdrant/js-client-rest"], dockerService: "qdrant", dockerVolume: "rag_qdrant", envHeader: "Qdrant", initNeeded: true, appEnvOverrides: { QDRANT_URL: "http://qdrant:6333" } },
  chroma: { id: "chroma", label: "Chroma", dir: "src/lib/vectorstore/chroma", deps: ["chromadb"], dockerService: "chroma", dockerVolume: "rag_chroma", envHeader: "Chroma", initNeeded: true, appEnvOverrides: { CHROMA_URL: "http://chroma:8000" } },
  weaviate: { id: "weaviate", label: "Weaviate", dir: "src/lib/vectorstore/weaviate", deps: ["weaviate-client"], dockerService: "weaviate", dockerVolume: "rag_weaviate", envHeader: "Weaviate", initNeeded: true, appEnvOverrides: { WEAVIATE_URL: "http://weaviate:8080" } },
  pinecone: { id: "pinecone", label: "Pinecone (managed)", dir: "src/lib/vectorstore/pinecone", deps: ["@pinecone-database/pinecone"], dockerService: null, dockerVolume: null, envHeader: "Pinecone", initNeeded: true, appEnvOverrides: null },
};

// Dependencies dropped when appKind === "api": the pruned frontend (Next.js,
// React, Auth.js's NextAuth package, and Tailwind) needs none of them. Only
// names that actually appear in the template's package.json today are listed
// — @tailwindcss/postcss (the Tailwind v4 PostCSS plugin) is included for
// forward-compatibility even though the template currently pins Tailwind v3
// (plain `tailwindcss` + `postcss` + `autoprefixer`); an absent name is a
// silent no-op in prunePackageJson, never an error.
//
// react-markdown/remark-gfm/rehype-highlight/highlight.js and
// @scalar/api-reference-react are not React/Next.js packages by name, but are
// exclusively consumed by pruned frontend files — src/components/chat/
// message-content.tsx (the first three + highlight.js's CSS theme, imported
// from the also-pruned src/app/globals.css) and src/app/docs/page.tsx (the
// last one; the api-only build's own /docs route uses @scalar/hono-api-reference
// instead) — so they would otherwise sit in the api-only package.json as pure
// dead weight.
export const API_ONLY_REMOVE_DEPS: string[] = [
  "next", "react", "react-dom", "@types/react", "@types/react-dom",
  "next-auth", "next-themes", "@ai-sdk/react", "@headlessui/react", "lucide-react",
  "tailwindcss", "@tailwindcss/postcss", "postcss", "autoprefixer",
  "rehype-highlight", "remark-gfm", "react-markdown", "highlight.js", "@scalar/api-reference-react",
];

// Dependencies dropped when appKind === "full": src/server/ (the standalone
// Hono server) is the only consumer of these. @auth/core is deliberately NOT
// here — src/lib/auth/session.ts (used by both app kinds) depends on it directly.
export const FULL_APP_REMOVE_DEPS: string[] = ["hono", "@hono/node-server", "@scalar/hono-api-reference"];

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
