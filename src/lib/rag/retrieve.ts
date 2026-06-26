import { sql, cosineDistance, gt, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chunks, documents } from "@/lib/db/schema";
import { estimateTokens } from "./tokens";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  filename: string;
  content: string;
  score: number;
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

// Default DB query: cosine similarity search in pgvector, joined to documents
// for the filename. Injectable via deps.run for unit tests.
async function defaultRun(queryEmbedding: number[], topK: number): Promise<RetrievedChunk[]> {
  const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, queryEmbedding)})`;
  const rows = await db
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
    .limit(topK);
  return rows;
}

export async function searchChunks(
  queryEmbedding: number[],
  opts: { topK: number; minSimilarity: number; tokenBudget: number },
  deps: { run?: (queryEmbedding: number[], topK: number) => Promise<RetrievedChunk[]> } = {},
): Promise<RetrievedChunk[]> {
  const run = deps.run ?? defaultRun;
  const raw = await run(queryEmbedding, opts.topK);
  const filtered = filterByThreshold(raw, opts.minSimilarity);
  return trimToBudget(filtered, opts.tokenBudget);
}
