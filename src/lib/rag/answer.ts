import { embedQuery } from "./embeddings";
import { searchChunks, type RetrievedChunk } from "./retrieve";
import { buildContext, type QuerySettings } from "./query";

export interface SourceRef {
  documentId: string;
  filename: string;
  chunkId: string;
  score: number;
}
export interface PreparedContext {
  hasContext: boolean;
  context: string;
  sources: SourceRef[];
}

// Embed the query, retrieve within budget, and build the context block.
// Returns hasContext=false (and empty context/sources) when nothing relevant
// is found, so callers can skip the generation model entirely.
export async function prepareContext(
  question: string,
  settings: QuerySettings,
  deps: { embed?: (q: string) => Promise<number[]>; retrieve?: typeof searchChunks } = {},
): Promise<PreparedContext> {
  const embed = deps.embed ?? embedQuery;
  const retrieve = deps.retrieve ?? searchChunks;
  const queryEmbedding = await embed(question);
  const chunks: RetrievedChunk[] = await retrieve(question, queryEmbedding, {
    topK: settings.topK,
    minSimilarity: settings.minSimilarity,
    tokenBudget: settings.contextTokenBudget,
  });
  if (chunks.length === 0) return { hasContext: false, context: "", sources: [] };
  return {
    hasContext: true,
    context: buildContext(chunks),
    sources: chunks.map((c) => ({ documentId: c.documentId, filename: c.filename, chunkId: c.chunkId, score: c.score })),
  };
}
