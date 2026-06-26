import { embed, embedMany } from "ai";
import { google } from "@ai-sdk/google";
import { hashContent } from "./hash";

export interface EmbedDeps {
  embedOne?: (text: string) => Promise<number[]>;
  embedBatch?: (texts: string[]) => Promise<number[][]>;
}

const embeddingModel = () => google.textEmbeddingModel("text-embedding-004");

// Real implementations (used when deps are not injected).
async function defaultEmbedOne(text: string): Promise<number[]> {
  const { embedding } = await embed({ model: embeddingModel(), value: text });
  return embedding;
}
async function defaultEmbedBatch(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({ model: embeddingModel(), values: texts });
  return embeddings;
}

// In-process query-embedding cache (hash -> vector). Avoids re-embedding
// repeated questions within a process lifetime.
const queryCache = new Map<string, number[]>();
export function clearQueryCache(): void {
  queryCache.clear();
}

export async function embedDocuments(texts: string[], deps: EmbedDeps = {}): Promise<number[][]> {
  if (texts.length === 0) return [];
  const batch = deps.embedBatch ?? defaultEmbedBatch;
  return batch(texts);
}

export async function embedQuery(text: string, deps: EmbedDeps = {}): Promise<number[]> {
  const key = hashContent(text);
  const cached = queryCache.get(key);
  if (cached) return cached;
  const one = deps.embedOne ?? defaultEmbedOne;
  const vector = await one(text);
  queryCache.set(key, vector);
  return vector;
}
