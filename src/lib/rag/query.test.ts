import { describe, it, expect, vi } from "vitest";
import { answerQuery, buildContext } from "@/lib/rag/query";
import type { RetrievedChunk } from "@/lib/rag/retrieve";

const settings = {
  topK: 5, model: "gemini-1.5-flash", temperature: 0.2,
  systemPrompt: "Use only the context.", minSimilarity: 0.3, contextTokenBudget: 3000,
};

const chunk = (id: string, score: number): RetrievedChunk => ({
  chunkId: id, documentId: "d" + id, filename: id + ".md", content: "content " + id, score,
});

describe("buildContext", () => {
  it("includes each chunk's content and a source marker", () => {
    const ctx = buildContext([chunk("a", 0.9), chunk("b", 0.8)]);
    expect(ctx).toContain("content a");
    expect(ctx).toContain("content b");
    expect(ctx).toContain("a.md");
    expect(ctx).toContain("b.md");
  });
});

describe("answerQuery", () => {
  it("embeds, retrieves, generates, and returns sources + usage", async () => {
    const embed = vi.fn(async () => [0.1, 0.2]);
    const retrieve = vi.fn(async () => [chunk("a", 0.9)]);
    const generate = vi.fn(async () => ({ text: "Blue.", usage: { promptTokens: 10, completionTokens: 2 } }));
    const result = await answerQuery("why?", settings, { embed, retrieve, generate });

    expect(embed).toHaveBeenCalledWith("why?");
    expect(retrieve).toHaveBeenCalledWith("why?", [0.1, 0.2], { topK: 5, minSimilarity: 0.3, tokenBudget: 3000 });
    expect(result.answer).toBe("Blue.");
    expect(result.sources).toEqual([{ documentId: "da", filename: "a.md", chunkId: "a", score: 0.9 }]);
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 2 });
  });

  it("returns a no-context answer without calling generate when nothing is retrieved", async () => {
    const generate = vi.fn();
    const result = await answerQuery("why?", settings, {
      embed: async () => [0], retrieve: async () => [], generate,
    });
    expect(generate).not.toHaveBeenCalled();
    expect(result.sources).toEqual([]);
    expect(result.answer).toMatch(/don't|no relevant|cannot/i);
    expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0 });
  });
});
