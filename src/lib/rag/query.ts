import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { embedQuery } from "./embeddings";
import { searchChunks, type RetrievedChunk } from "./retrieve";

export interface QuerySettings {
  topK: number;
  model: string;
  temperature: number;
  systemPrompt: string;
  minSimilarity: number;
  contextTokenBudget: number;
}

export interface QueryResult {
  answer: string;
  sources: Array<{ documentId: string; filename: string; chunkId: string; score: number }>;
  usage: { promptTokens: number; completionTokens: number };
}

export interface QueryDeps {
  embed?: (q: string) => Promise<number[]>;
  retrieve?: (
    emb: number[],
    opts: { topK: number; minSimilarity: number; tokenBudget: number },
  ) => Promise<RetrievedChunk[]>;
  generate?: (args: {
    system: string;
    prompt: string;
    model: string;
    temperature: number;
  }) => Promise<{ text: string; usage: { promptTokens: number; completionTokens: number } }>;
}

// Format retrieved chunks into a numbered context block with source markers.
export function buildContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map((c, i) => `[${i + 1}] (source: ${c.filename})\n${c.content}`)
    .join("\n\n");
}

async function defaultGenerate(args: {
  system: string;
  prompt: string;
  model: string;
  temperature: number;
}) {
  const { text, usage } = await generateText({
    model: google(args.model),
    system: args.system,
    prompt: args.prompt,
    temperature: args.temperature,
  });
  return {
    text,
    usage: {
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
    },
  };
}

const NO_CONTEXT_ANSWER =
  "I don't have any relevant information in the knowledge base to answer that.";

export async function answerQuery(
  question: string,
  settings: QuerySettings,
  deps: QueryDeps = {},
): Promise<QueryResult> {
  const embed = deps.embed ?? embedQuery;
  const retrieve = deps.retrieve ?? searchChunks;
  const generate = deps.generate ?? defaultGenerate;

  const queryEmbedding = await embed(question);
  const chunks = await retrieve(queryEmbedding, {
    topK: settings.topK,
    minSimilarity: settings.minSimilarity,
    tokenBudget: settings.contextTokenBudget,
  });

  if (chunks.length === 0) {
    return { answer: NO_CONTEXT_ANSWER, sources: [], usage: { promptTokens: 0, completionTokens: 0 } };
  }

  const context = buildContext(chunks);
  const prompt = `Context:\n${context}\n\nQuestion: ${question}`;
  const { text, usage } = await generate({
    system: settings.systemPrompt,
    prompt,
    model: settings.model,
    temperature: settings.temperature,
  });

  return {
    answer: text,
    sources: chunks.map((c) => ({
      documentId: c.documentId,
      filename: c.filename,
      chunkId: c.chunkId,
      score: c.score,
    })),
    usage,
  };
}
