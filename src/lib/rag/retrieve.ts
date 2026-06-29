import { sql, cosineDistance, gt, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chunks, documents } from "@/lib/db/schema";
import { estimateTokens } from "./tokens";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  filename: string;
  content: string;
  score: number; // cosine similarity (kept for display/threshold even in hybrid mode)
}

export function filterByThreshold(items: RetrievedChunk[], minSimilarity: number): RetrievedChunk[] {
  return items.filter((c) => c.score >= minSimilarity);
}

// Keep highest-scored chunks until the next one would exceed the token budget.
// Always keeps at least the top-ranked chunk.
export function trimToBudget(items: RetrievedChunk[], tokenBudget: number): RetrievedChunk[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const kept: RetrievedChunk[] = [];
  let used = 0;
  for (const c of sorted) {
    const cost = estimateTokens(c.content);
    if (kept.length > 0 && used + cost > tokenBudget) break;
    kept.push(c);
    used += cost;
  }
  return kept;
}

// Candidate pool size pulled from each retriever before fusion, and the RRF
// constant (60 is the value from the original Reciprocal Rank Fusion paper).
const CANDIDATE_POOL = 30;
const RRF_K = 60;

// Vector branch: cosine similarity search in pgvector, joined to documents.
async function defaultVectorRun(queryEmbedding: number[], limit: number): Promise<RetrievedChunk[]> {
  const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, queryEmbedding)})`;
  return db
    .select({
      chunkId: chunks.id,
      documentId: chunks.documentId,
      filename: documents.filename,
      content: chunks.content,
      score: similarity,
    })
    .from(chunks)
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(gt(similarity, 0))
    .orderBy((t) => desc(t.score))
    .limit(limit);
}

// Keyword branch: Postgres full-text search over content using the
// language-agnostic 'simple' config (good for named entities and the all-caps,
// inflected text dense vectors rank poorly). Prefix-matched OR query maximizes
// recall; rows are ranked by ts_rank but carry their cosine score for display.
async function defaultKeywordRun(query: string, queryEmbedding: number[], limit: number): Promise<RetrievedChunk[]> {
  const tokens = [...new Set((query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length >= 2))];
  if (tokens.length === 0) return [];
  const tsq = tokens.map((t) => `${t}:*`).join(" | ");
  const tsv = sql`to_tsvector('simple', ${chunks.content})`;
  const tsquery = sql`to_tsquery('simple', ${tsq})`;
  const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, queryEmbedding)})`;
  return db
    .select({
      chunkId: chunks.id,
      documentId: chunks.documentId,
      filename: documents.filename,
      content: chunks.content,
      score: similarity,
    })
    .from(chunks)
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(sql`${tsv} @@ ${tsquery}`)
    .orderBy(sql`ts_rank(${tsv}, ${tsquery}) desc`)
    .limit(limit);
}

export interface SearchDeps {
  vectorRun?: (queryEmbedding: number[], limit: number) => Promise<RetrievedChunk[]>;
  keywordRun?: (query: string, queryEmbedding: number[], limit: number) => Promise<RetrievedChunk[]>;
}

// Hybrid retrieval: fuse vector and keyword candidate lists with Reciprocal
// Rank Fusion, then gate by relevance and trim to the token budget. Dense-only
// search ranks named-entity / keyword questions too low; the keyword branch
// recovers those while the vector branch keeps semantic matches.
export async function searchChunks(
  query: string,
  queryEmbedding: number[],
  opts: { topK: number; minSimilarity: number; tokenBudget: number },
  deps: SearchDeps = {},
): Promise<RetrievedChunk[]> {
  const vectorRun = deps.vectorRun ?? defaultVectorRun;
  const keywordRun = deps.keywordRun ?? defaultKeywordRun;
  const pool = Math.max(opts.topK, CANDIDATE_POOL);

  const [vec, kw] = await Promise.all([
    vectorRun(queryEmbedding, pool),
    keywordRun(query, queryEmbedding, pool),
  ]);

  const meta = new Map<string, RetrievedChunk>();
  const cosineById = new Map<string, number>();
  const rrf = new Map<string, number>();
  const fuse = (list: RetrievedChunk[]) => {
    list.forEach((c, i) => {
      if (!meta.has(c.chunkId)) meta.set(c.chunkId, c);
      cosineById.set(c.chunkId, Math.max(cosineById.get(c.chunkId) ?? -1, c.score));
      rrf.set(c.chunkId, (rrf.get(c.chunkId) ?? 0) + 1 / (RRF_K + i + 1));
    });
  };
  fuse(vec);
  fuse(kw);
  const keywordIds = new Set(kw.map((c) => c.chunkId));

  const ranked = [...rrf.keys()]
    // Relevance gate: keep keyword matches, or vector hits at/above the threshold.
    // Keyword matches bypass the cosine gate because an exact term hit is
    // high-confidence even when its dense similarity is modest.
    .filter((id) => keywordIds.has(id) || (cosineById.get(id) ?? 0) >= opts.minSimilarity)
    .sort((a, b) => rrf.get(b)! - rrf.get(a)!)
    .map((id) => ({ ...meta.get(id)!, score: cosineById.get(id)! }));

  // Token-budget trim in fused-rank order (always keep the top chunk), capped to topK.
  const kept: RetrievedChunk[] = [];
  let used = 0;
  for (const c of ranked) {
    if (kept.length >= opts.topK) break;
    const cost = estimateTokens(c.content);
    if (kept.length > 0 && used + cost > opts.tokenBudget) break;
    kept.push(c);
    used += cost;
  }
  return kept;
}
