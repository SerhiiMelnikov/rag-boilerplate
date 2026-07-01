import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel, EmbeddingModel } from "ai";

// Ollama exposes an OpenAI-compatible API, so we reuse the OpenAI adapter
// against its /v1 endpoint with a placeholder key. No extra dependency.
function client(baseUrl: string) {
  return createOpenAI({ baseURL: baseUrl.replace(/\/+$/, "") + "/v1", apiKey: "ollama" });
}

export function ollamaChat(baseUrl: string, model: string): LanguageModel {
  return client(baseUrl)(model);
}

// Ollama embedding models emit their native dimension (validated downstream).
export function ollamaEmbedding(baseUrl: string, model: string): EmbeddingModel<string> {
  return client(baseUrl).textEmbeddingModel(model);
}
