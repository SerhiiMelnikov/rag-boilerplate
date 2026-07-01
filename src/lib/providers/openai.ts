import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel, EmbeddingModel } from "ai";
import { EMBEDDING_DIMENSIONS } from "./embedding";

export function openaiChat(apiKey: string, model: string): LanguageModel {
  return createOpenAI({ apiKey })(model);
}

export function openaiEmbedding(apiKey: string, model: string): EmbeddingModel<string> {
  return createOpenAI({ apiKey }).textEmbeddingModel(model, { dimensions: EMBEDDING_DIMENSIONS });
}
