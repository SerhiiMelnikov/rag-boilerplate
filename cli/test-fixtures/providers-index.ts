import type { LanguageModel, EmbeddingModel } from "ai";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import { MissingProviderKeyError, type ProviderId, type EmbeddingProviderId, type EmbeddingKind } from "./types";
import { googleChat, googleEmbedding } from "./google";
import { openaiChat, openaiEmbedding } from "./openai";
import { anthropicChat } from "./anthropic";
import { ollamaChat, ollamaEmbedding } from "./ollama";

function keyFor(provider: ProviderId, s: RuntimeSettings): string | null {
  switch (provider) {
    case "google": return s.keys.google;
    case "openai": return s.keys.openai;
    case "anthropic": return s.keys.anthropic;
    case "ollama": return null; // no key needed
  }
}

function requireKey(task: string, provider: ProviderId, s: RuntimeSettings): string {
  const key = keyFor(provider, s);
  if (!key) throw new MissingProviderKeyError(task, provider);
  return key;
}

export function getChatModel(s: RuntimeSettings, task = "Chat"): LanguageModel {
  const provider = s.chatProvider as ProviderId;
  switch (provider) {
    case "google": return googleChat(requireKey(task, provider, s), s.chatModel);
    case "openai": return openaiChat(requireKey(task, provider, s), s.chatModel);
    case "anthropic": return anthropicChat(requireKey(task, provider, s), s.chatModel);
    case "ollama": return ollamaChat(s.ollamaBaseUrl, s.chatModel);
  }
}

export function getVisionModel(s: RuntimeSettings, task = "Document parsing"): LanguageModel {
  const provider = s.parserProvider as ProviderId;
  switch (provider) {
    case "google": return googleChat(requireKey(task, provider, s), s.parserModel);
    case "openai": return openaiChat(requireKey(task, provider, s), s.parserModel);
    case "anthropic": return anthropicChat(requireKey(task, provider, s), s.parserModel);
    case "ollama": return ollamaChat(s.ollamaBaseUrl, s.parserModel);
  }
}

export function getEmbeddingModel(s: RuntimeSettings, kind: EmbeddingKind, task = "Ingestion"): EmbeddingModel<string> {
  const provider = s.embeddingProvider as EmbeddingProviderId;
  switch (provider) {
    case "google": return googleEmbedding(requireKey(task, provider, s), s.embeddingModel, kind);
    case "openai": return openaiEmbedding(requireKey(task, provider, s), s.embeddingModel);
    case "ollama": return ollamaEmbedding(s.ollamaBaseUrl, s.embeddingModel);
  }
}
