import { describe, it, expect } from "vitest";
import { googleChat, googleEmbedding } from "./google";
import { openaiChat, openaiEmbedding } from "./openai";
import { anthropicChat } from "./anthropic";
import { ollamaChat, ollamaEmbedding } from "./ollama";

describe("provider adapters", () => {
  it("build chat models for each provider without a network call", () => {
    expect(googleChat("k", "gemma-4-31b-it")).toBeDefined();
    expect(openaiChat("k", "gpt-4o")).toBeDefined();
    expect(anthropicChat("k", "claude-sonnet-5")).toBeDefined();
    expect(ollamaChat("http://localhost:11434", "llama3")).toBeDefined();
  });

  it("build embedding models for the embedding-capable providers", () => {
    expect(googleEmbedding("k", "gemini-embedding-2", "document")).toBeDefined();
    expect(googleEmbedding("k", "gemini-embedding-2", "query")).toBeDefined();
    expect(openaiEmbedding("k", "text-embedding-3-small")).toBeDefined();
    expect(ollamaEmbedding("http://localhost:11434", "nomic-embed-text")).toBeDefined();
  });

  it("ollama tolerates a trailing slash in the base URL", () => {
    expect(ollamaChat("http://localhost:11434/", "llama3")).toBeDefined();
  });
});
