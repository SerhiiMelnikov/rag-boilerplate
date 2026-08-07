import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel, EmbeddingModel, TranscriptionModel } from "ai";
import { EMBEDDING_DIMENSIONS } from "./embedding";

export function openaiChat(apiKey: string, model: string): LanguageModel {
  return createOpenAI({ apiKey })(model);
}

export function openaiEmbedding(apiKey: string, model: string): EmbeddingModel<string> {
  return createOpenAI({ apiKey }).textEmbeddingModel(model, { dimensions: EMBEDDING_DIMENSIONS });
}

export function openaiTranscription(apiKey: string, model: string): TranscriptionModel {
  return createOpenAI({ apiKey }).transcription(model);
}
