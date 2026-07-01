import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel, EmbeddingModel } from "ai";
import { EMBEDDING_DIMENSIONS } from "./embedding";
import type { EmbeddingKind } from "./types";

// Chat + vision share the same Gemini model type (it accepts file parts).
export function googleChat(apiKey: string, model: string): LanguageModel {
  return createGoogleGenerativeAI({ apiKey })(model);
}

export function googleEmbedding(apiKey: string, model: string, kind: EmbeddingKind): EmbeddingModel<string> {
  return createGoogleGenerativeAI({ apiKey }).textEmbeddingModel(model, {
    outputDimensionality: EMBEDDING_DIMENSIONS,
    taskType: kind === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
  });
}
