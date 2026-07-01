import { estimateTokens } from "@/lib/rag/tokens";
import type { RetrievedChunk } from "./types";

// RRF constant from the original Reciprocal Rank Fusion paper.
const RRF_K = 60;

// Fuse the vector and keyword candidate lists with Reciprocal Rank Fusion, gate
// by relevance, then trim to the token budget (capped at topK). Store-agnostic:
// each adapter supplies only the two candidate lists. Logic preserved verbatim
// from the previous retrieve.ts implementation.
export function fuse(
  vec: RetrievedChunk[],
  kw: RetrievedChunk[],
  opts: { topK: number; minSimilarity: number; tokenBudget: number },
): RetrievedChunk[] {
  const meta = new Map<string, RetrievedChunk>();
  const cosineById = new Map<string, number>();
  const rrf = new Map<string, number>();
  const add = (list: RetrievedChunk[]) => {
    list.forEach((cchunk, i) => {
      if (!meta.has(cchunk.chunkId)) meta.set(cchunk.chunkId, cchunk);
      cosineById.set(cchunk.chunkId, Math.max(cosineById.get(cchunk.chunkId) ?? -1, cchunk.score));
      rrf.set(cchunk.chunkId, (rrf.get(cchunk.chunkId) ?? 0) + 1 / (RRF_K + i + 1));
    });
  };
  add(vec);
  add(kw);
  const keywordIds = new Set(kw.map((cchunk) => cchunk.chunkId));

  const ranked = [...rrf.keys()]
    // Keyword matches bypass the cosine gate (an exact term hit is high-confidence
    // even when dense similarity is modest); vector-only hits must clear minSimilarity.
    .filter((id) => keywordIds.has(id) || (cosineById.get(id) ?? 0) >= opts.minSimilarity)
    .sort((a, b) => rrf.get(b)! - rrf.get(a)!)
    .map((id) => ({ ...meta.get(id)!, score: cosineById.get(id)! }));

  const kept: RetrievedChunk[] = [];
  let used = 0;
  for (const cchunk of ranked) {
    if (kept.length >= opts.topK) break;
    const cost = estimateTokens(cchunk.content);
    if (kept.length > 0 && used + cost > opts.tokenBudget) break;
    kept.push(cchunk);
    used += cost;
  }
  return kept;
}
