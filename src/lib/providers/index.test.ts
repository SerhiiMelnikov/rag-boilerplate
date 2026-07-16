import { describe, it, expect } from "vitest";
import { getChatModel, getVisionModel, getEmbeddingModel, getImageModel } from "./index";
import { MissingProviderKeyError } from "./types";
import type { RuntimeSettings } from "@/lib/config/settings-service";

function settings(over: Partial<RuntimeSettings> = {}): RuntimeSettings {
  return {
    chatProvider: "google", chatModel: "gemma-4-31b-it",
    embeddingProvider: "google", embeddingModel: "gemini-embedding-2",
    parserProvider: "google", parserModel: "gemini-2.5-flash",
    imageProvider: "google", imageModel: "gemini-2.5-flash",
    unifiedMode: false, unifiedProvider: "google", unifiedModel: "gemma-4-31b-it",
    temperature: 0.2, topK: 5, minSimilarity: 0.3, contextTokenBudget: 3000,
    systemPrompt: "sp", ollamaBaseUrl: "http://localhost:11434",
    chatRateLimitPerMinute: 20, chatRateLimitPerDay: 200,
    keys: { google: "gk", openai: null, anthropic: null },
    ...over,
  };
}

describe("provider factory", () => {
  it("builds a chat model for a provider whose key is set", () => {
    expect(getChatModel(settings())).toBeDefined();
  });

  it("throws MissingProviderKeyError (with task) when the chat key is absent", () => {
    const s = settings({ chatProvider: "openai", chatModel: "gpt-4o" }); // openai key is null
    expect(() => getChatModel(s)).toThrow(MissingProviderKeyError);
    try { getChatModel(s); } catch (e) { expect((e as MissingProviderKeyError).task).toBe("Chat"); }
  });

  it("ollama needs no key", () => {
    expect(getChatModel(settings({ chatProvider: "ollama", chatModel: "llama3", keys: { google: null, openai: null, anthropic: null } }))).toBeDefined();
  });

  it("getVisionModel uses the parser provider and its default task name", () => {
    const s = settings({ parserProvider: "anthropic", parserModel: "claude-sonnet-5" }); // anthropic key null
    try { getVisionModel(s); } catch (e) { expect((e as MissingProviderKeyError).task).toBe("Document parsing"); }
  });

  it("getEmbeddingModel builds document and query models", () => {
    expect(getEmbeddingModel(settings(), "document")).toBeDefined();
    expect(getEmbeddingModel(settings(), "query")).toBeDefined();
  });

  it("getImageModel builds a model for the configured image provider", () => {
    const s = { ...settings(), imageProvider: "google", imageModel: "gemini-2.5-flash", keys: { google: "k", openai: null, anthropic: null } } as RuntimeSettings;
    expect(getImageModel(s)).toBeTruthy();
  });

  it("getImageModel throws MissingProviderKeyError when the image provider has no key", () => {
    const s = { ...settings(), imageProvider: "openai", imageModel: "gpt-4o", keys: { google: null, openai: null, anthropic: null } } as RuntimeSettings;
    expect(() => getImageModel(s)).toThrow(MissingProviderKeyError);
  });
});
