import { describe, it, expect, vi } from "vitest";
import { prepareContext } from "@/lib/rag/answer";
import type { RetrievedChunk } from "@/lib/rag/retrieve";

const settings = { topK: 5, model: "gemma-4-31b-it", temperature: 0.2, systemPrompt: "sp", minSimilarity: 0.3, contextTokenBudget: 3000 };
const chunk = (id: string, score: number): RetrievedChunk => ({ chunkId: id, documentId: "d" + id, filename: id + ".md", content: "content " + id, score });

describe("prepareContext", () => {
  it("returns hasContext=false and empty fields when nothing retrieved", async () => {
    const out = await prepareContext("q", settings, { embed: async () => [0.1], retrieve: async () => [] });
    expect(out.hasContext).toBe(false);
    expect(out.sources).toEqual([]);
    expect(out.context).toBe("");
  });

  it("builds context and maps sources when chunks are retrieved", async () => {
    const retrieve = vi.fn(async () => [chunk("a", 0.9)]);
    const out = await prepareContext("q", settings, { embed: async () => [0.1, 0.2], retrieve });
    expect(retrieve).toHaveBeenCalledWith([0.1, 0.2], { topK: 5, minSimilarity: 0.3, tokenBudget: 3000 });
    expect(out.hasContext).toBe(true);
    expect(out.context).toContain("content a");
    expect(out.sources).toEqual([{ documentId: "da", filename: "a.md", chunkId: "a", score: 0.9 }]);
  });
});
