import { embed, embedMany } from "ai";
import { hashContent } from "./hash";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import { getEmbeddingModel } from "@/lib/providers";
import { assertEmbeddingDimension } from "@/lib/providers/embedding";
import { toProviderError } from "@/lib/providers/types";

export interface EmbedDeps {
  embedOne?: (text: string) => Promise<number[]>;
  embedBatch?: (texts: string[]) => Promise<number[][]>;
}

// Real implementations (used when deps are not injected). Both validate the
// vector width and map auth failures to InvalidProviderKeyError.
async function defaultEmbedOne(text: string, settings: RuntimeSettings): Promise<number[]> {
  try {
    const { embedding } = await embed({ model: getEmbeddingModel(settings, "query", "Retrieval"), value: text });
    return assertEmbeddingDimension(embedding);
  } catch (err) {
    throw toProviderError(err, "Retrieval", settings.embeddingProvider);
  }
}
async function defaultEmbedBatch(texts: string[], settings: RuntimeSettings): Promise<number[][]> {
  try {
    const { embeddings } = await embedMany({ model: getEmbeddingModel(settings, "document", "Ingestion"), values: texts });
    return embeddings.map(assertEmbeddingDimension);
  } catch (err) {
    throw toProviderError(err, "Ingestion", settings.embeddingProvider);
  }
}

// In-process query-embedding cache. Keyed by provider+model+text so a provider
// or model switch never returns cross-incompatible cached vectors.
const queryCache = new Map<string, number[]>();
export function clearQueryCache(): void {
  queryCache.clear();
}

export async function embedDocuments(texts: string[], settings: RuntimeSettings, deps: EmbedDeps = {}): Promise<number[][]> {
  if (texts.length === 0) return [];
  const batch = deps.embedBatch ?? ((t) => defaultEmbedBatch(t, settings));
  return batch(texts);
}

export async function embedQuery(text: string, settings: RuntimeSettings, deps: EmbedDeps = {}): Promise<number[]> {
  const key = hashContent(`${settings.embeddingProvider}:${settings.embeddingModel}:${text}`);
  const cached = queryCache.get(key);
  if (cached) return cached;
  const one = deps.embedOne ?? ((t) => defaultEmbedOne(t, settings));
  const vector = await one(text);
  queryCache.set(key, vector);
  return vector;
}
