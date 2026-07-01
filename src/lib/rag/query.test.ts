import { describe, it, expect } from "vitest";
import { buildContext } from "@/lib/rag/query";
import type { RetrievedChunk } from "@/lib/rag/retrieve";

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
