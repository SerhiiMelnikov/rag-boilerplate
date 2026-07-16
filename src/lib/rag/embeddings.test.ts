import { describe, it, expect, vi, beforeEach } from "vitest";
import { embedQuery, embedDocuments, clearQueryCache } from "@/lib/rag/embeddings";
import type { RuntimeSettings } from "@/lib/config/settings-service";

const settings = {
  chatProvider: "google", chatModel: "gemma-4-31b-it",
  embeddingProvider: "google", embeddingModel: "gemini-embedding-2",
  parserProvider: "google", parserModel: "gemini-2.5-flash",
  imageProvider: "google", imageModel: "gemini-2.5-flash",
  unifiedMode: false, unifiedProvider: "google", unifiedModel: "gemma-4-31b-it",
  temperature: 0.2, topK: 5, minSimilarity: 0.3, contextTokenBudget: 3000,
  systemPrompt: "sp", ollamaBaseUrl: "http://localhost:11434",
  chatRateLimitPerMinute: 20, chatRateLimitPerDay: 200, registerRateLimitPerHour: 5,
  keys: { google: "gk", openai: null, anthropic: null },
} satisfies RuntimeSettings;

beforeEach(() => clearQueryCache());

describe("embeddings", () => {
  it("batches document embedding via injected batch fn", async () => {
    const embedBatch = vi.fn(async (texts: string[]) => texts.map((_, i) => [i, i, i]));
    const result = await embedDocuments(["a", "b"], settings, { embedBatch });
    expect(embedBatch).toHaveBeenCalledTimes(1);
    expect(result).toEqual([[0, 0, 0], [1, 1, 1]]);
  });

  it("caches identical queries (no second call)", async () => {
    const embedOne = vi.fn(async () => [1, 2, 3]);
    const a = await embedQuery("same", settings, { embedOne });
    const b = await embedQuery("same", settings, { embedOne });
    expect(a).toEqual([1, 2, 3]);
    expect(b).toEqual([1, 2, 3]);
    expect(embedOne).toHaveBeenCalledTimes(1);
  });

  it("does not cache different queries", async () => {
    const embedOne = vi.fn(async (t: string) => [t.length]);
    await embedQuery("one", settings, { embedOne });
    await embedQuery("two!", settings, { embedOne });
    expect(embedOne).toHaveBeenCalledTimes(2);
  });

  it("caches per embedding model — switching model re-embeds", async () => {
    clearQueryCache();
    const embedOne = vi.fn(async () => [1, 2, 3]);
    await embedQuery("q", settings, { embedOne });
    await embedQuery("q", settings, { embedOne }); // cache hit
    expect(embedOne).toHaveBeenCalledTimes(1);
    await embedQuery("q", { ...settings, embeddingModel: "text-embedding-3-small" }, { embedOne });
    expect(embedOne).toHaveBeenCalledTimes(2); // different model -> miss
  });
});
