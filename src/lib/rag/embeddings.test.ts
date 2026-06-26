import { describe, it, expect, vi, beforeEach } from "vitest";
import { embedQuery, embedDocuments, clearQueryCache } from "@/lib/rag/embeddings";

beforeEach(() => clearQueryCache());

describe("embeddings", () => {
  it("batches document embedding via injected batch fn", async () => {
    const embedBatch = vi.fn(async (texts: string[]) => texts.map((_, i) => [i, i, i]));
    const result = await embedDocuments(["a", "b"], { embedBatch });
    expect(embedBatch).toHaveBeenCalledTimes(1);
    expect(result).toEqual([[0, 0, 0], [1, 1, 1]]);
  });

  it("caches identical queries (no second call)", async () => {
    const embedOne = vi.fn(async () => [1, 2, 3]);
    const a = await embedQuery("same", { embedOne });
    const b = await embedQuery("same", { embedOne });
    expect(a).toEqual([1, 2, 3]);
    expect(b).toEqual([1, 2, 3]);
    expect(embedOne).toHaveBeenCalledTimes(1);
  });

  it("does not cache different queries", async () => {
    const embedOne = vi.fn(async (t: string) => [t.length]);
    await embedQuery("one", { embedOne });
    await embedQuery("two!", { embedOne });
    expect(embedOne).toHaveBeenCalledTimes(2);
  });
});
