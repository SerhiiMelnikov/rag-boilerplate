import { describe, it, expect } from "vitest";
import { createDrizzleStore } from "@/lib/rag/store";

describe("createDrizzleStore", () => {
  it("implements the IngestStore interface", () => {
    const store = createDrizzleStore();
    for (const m of ["createDocument", "setStatus", "existingHashes", "insertChunks"]) {
      expect(typeof (store as unknown as Record<string, unknown>)[m]).toBe("function");
    }
  });
});
