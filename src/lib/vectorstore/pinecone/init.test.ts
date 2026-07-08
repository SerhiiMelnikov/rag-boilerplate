import { describe, it, expect, vi } from "vitest";
import { ensurePineconeIndexes } from "./init";

function fakePc(existing: string[]) {
  return {
    listIndexes: vi.fn(async () => ({ indexes: existing.map((name) => ({ name })) })),
    createIndex: vi.fn(async () => ({})),
    createIndexForModel: vi.fn(async () => ({})),
  } as any;
}

describe("ensurePineconeIndexes", () => {
  it("creates all three indexes when none exist", async () => {
    const pc = fakePc([]);
    await ensurePineconeIndexes(pc);
    expect(pc.createIndex).toHaveBeenCalledTimes(2); // chunk dense + image dense
    for (const [cfg] of pc.createIndex.mock.calls) {
      expect(cfg.dimension).toBe(768);
      expect(cfg.metric).toBe("cosine");
    }
    expect(pc.createIndexForModel).toHaveBeenCalledTimes(1); // chunk sparse
  });

  it("is a no-op when all indexes exist", async () => {
    const pc = fakePc(["rag-chunks-dense", "rag-chunks-sparse", "rag-images-dense"]);
    await ensurePineconeIndexes(pc);
    expect(pc.createIndex).not.toHaveBeenCalled();
    expect(pc.createIndexForModel).not.toHaveBeenCalled();
  });
});
