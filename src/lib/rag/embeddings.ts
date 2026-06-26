import { embed, embedMany } from "ai";
import { google } from "@ai-sdk/google";
import { hashContent } from "./hash";

export interface EmbedDeps {
  embedOne?: (text: string) => Promise<number[]>;
  embedBatch?: (texts: string[]) => Promise<number[][]>;
}

// Embedding model: gemini-embedding-2 reduced to 768 dimensions via
// outputDimensionality, matching the chunks.embedding column. Task types are
// set per use: documents are embedded for retrieval storage, queries for
// querying. Cosine similarity is magnitude-invariant, so reduced-dimension
// vectors need no extra normalization for ranking.
const EMBEDDING_MODEL = "gemini-embedding-2";
const OUTPUT_DIMENSIONS = 768;

const documentEmbeddingModel = () =>
  google.textEmbeddingModel(EMBEDDING_MODEL, {
    outputDimensionality: OUTPUT_DIMENSIONS,
    taskType: "RETRIEVAL_DOCUMENT",
  });
const queryEmbeddingModel = () =>
  google.textEmbeddingModel(EMBEDDING_MODEL, {
    outputDimensionality: OUTPUT_DIMENSIONS,
    taskType: "RETRIEVAL_QUERY",
  });

// Real implementations (used when deps are not injected).
async function defaultEmbedOne(text: string): Promise<number[]> {
  const { embedding } = await embed({ model: queryEmbeddingModel(), value: text });
  return embedding;
}
async function defaultEmbedBatch(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({ model: documentEmbeddingModel(), values: texts });
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
