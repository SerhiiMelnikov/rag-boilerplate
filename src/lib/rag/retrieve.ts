import { getVectorStore } from "@/lib/vectorstore";
import { fuse } from "@/lib/vectorstore/fusion";
import type { RetrievedChunk, VectorStore } from "@/lib/vectorstore/types";

// Re-export so existing importers (answer.ts, query.ts) keep their import path.
export type { RetrievedChunk } from "@/lib/vectorstore/types";

// Candidate pool pulled from each retriever before fusion.
const CANDIDATE_POOL = 30;

export interface SearchDeps {
  store?: VectorStore;
}

// Hybrid retrieval: pull vector + keyword candidates from the configured store,
// then fuse with store-agnostic RRF, gate by relevance, and trim to the budget.
export async function searchChunks(
  query: string,
  queryEmbedding: number[],
  opts: { topK: number; minSimilarity: number; tokenBudget: number },
  deps: SearchDeps = {},
): Promise<RetrievedChunk[]> {
  const store = deps.store ?? getVectorStore();
  const pool = Math.max(opts.topK, CANDIDATE_POOL);
  const [vec, kw] = await Promise.all([
    store.searchVector(queryEmbedding, pool),
    store.searchKeyword(query, queryEmbedding, pool),
  ]);
  return fuse(vec, kw, opts);
}
