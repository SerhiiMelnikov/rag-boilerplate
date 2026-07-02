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
  it("creates both indexes when neither exists", async () => {
    const pc = fakePc([]);
    await ensurePineconeIndexes(pc);
    expect(pc.createIndex).toHaveBeenCalledTimes(1); // dense
    const denseCfg = pc.createIndex.mock.calls[0][0];
    expect(denseCfg.dimension).toBe(768);
    expect(denseCfg.metric).toBe("cosine");
    expect(pc.createIndexForModel).toHaveBeenCalledTimes(1); // sparse
  });

  it("is a no-op when both indexes exist", async () => {
    const pc = fakePc(["rag-chunks-dense", "rag-chunks-sparse"]);
    await ensurePineconeIndexes(pc);
    expect(pc.createIndex).not.toHaveBeenCalled();
    expect(pc.createIndexForModel).not.toHaveBeenCalled();
  });
});
