import { describe, it, expect, vi } from "vitest";
import { ensurePineconeIndexes } from "./init";

// Deliberate: the real param type is the full Pinecone SDK client; this fake
// only implements the three calls ensurePineconeIndexes makes. `never` (not
// `any`) bridges it at each call site below.
function fakePc(existing: string[]) {
  return {
    listIndexes: vi.fn(async () => ({ indexes: existing.map((name) => ({ name })) })),
    createIndex: vi.fn(async (_cfg: { dimension: number; metric: string }) => ({})),
    createIndexForModel: vi.fn(async () => ({})),
  };
}

describe("ensurePineconeIndexes", () => {
  it("creates all three indexes when none exist", async () => {
    const pc = fakePc([]);
    await ensurePineconeIndexes(pc as never);
    expect(pc.createIndex).toHaveBeenCalledTimes(2); // chunk dense + image dense
    for (const [cfg] of pc.createIndex.mock.calls) {
      expect(cfg.dimension).toBe(768);
      expect(cfg.metric).toBe("cosine");
    }
    expect(pc.createIndexForModel).toHaveBeenCalledTimes(1); // chunk sparse
  });

  it("is a no-op when all indexes exist", async () => {
    const pc = fakePc(["rag-chunks-dense", "rag-chunks-sparse", "rag-images-dense"]);
    await ensurePineconeIndexes(pc as never);
    expect(pc.createIndex).not.toHaveBeenCalled();
    expect(pc.createIndexForModel).not.toHaveBeenCalled();
  });
});
