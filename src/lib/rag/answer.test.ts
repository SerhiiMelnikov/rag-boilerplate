import { describe, it, expect, vi } from "vitest";
import { prepareContext } from "@/lib/rag/answer";
import type { RetrievedChunk } from "@/lib/rag/retrieve";
import type { RuntimeSettings } from "@/lib/config/settings-service";

const settings: RuntimeSettings = {
  chatProvider: "google", chatModel: "gemma-4-31b-it",
  embeddingProvider: "google", embeddingModel: "text-embedding-004",
  parserProvider: "google", parserModel: "gemini-1.5-flash",
  imageProvider: "google", imageModel: "gemini-2.5-flash",
  unifiedMode: false, unifiedProvider: "google", unifiedModel: "gemma-4-31b-it",
  temperature: 0.2, topK: 5, minSimilarity: 0.3, contextTokenBudget: 3000,
  systemPrompt: "sp", ollamaBaseUrl: "http://localhost:11434",
  chatRateLimitPerMinute: 20, chatRateLimitPerDay: 200,
  registrationMode: "verified", allowedEmailDomains: "",
  smtpHost: "", smtpPort: 587, smtpUser: "", smtpFrom: "",
  keys: { google: null, openai: null, anthropic: null },
  smtpPassword: null,
};
const chunk = (id: string, score: number): RetrievedChunk => ({ chunkId: id, documentId: "d" + id, filename: id + ".md", content: "content " + id, score });

describe("prepareContext", () => {
  it("returns hasContext=false and empty fields when nothing retrieved", async () => {
    const out = await prepareContext("q", settings, {}, { embed: async () => [0.1], retrieve: async () => [] });
    expect(out.hasContext).toBe(false);
    expect(out.sources).toEqual([]);
    expect(out.context).toBe("");
  });

  it("builds context and maps sources when chunks are retrieved", async () => {
    const retrieve = vi.fn(async () => [chunk("a", 0.9)]);
    const out = await prepareContext("q", settings, {}, { embed: async () => [0.1, 0.2], retrieve });
    expect(retrieve).toHaveBeenCalledWith("q", [0.1, 0.2], { topK: 5, minSimilarity: 0.3, tokenBudget: 3000 });
    expect(out.hasContext).toBe(true);
    expect(out.context).toContain("content a");
    expect(out.sources).toEqual([{ documentId: "da", filename: "a.md", chunkId: "a", score: 0.9 }]);
  });

  it("forwards allowedDocumentIds into the retrieval opts", async () => {
    const retrieve = vi.fn(async () => []);
    await prepareContext("q", settings, { allowedDocumentIds: ["d1"] }, { embed: async () => [0.1], retrieve });
    expect(retrieve).toHaveBeenCalledWith("q", [0.1], expect.objectContaining({ allowedDocumentIds: ["d1"] }));
  });
});
