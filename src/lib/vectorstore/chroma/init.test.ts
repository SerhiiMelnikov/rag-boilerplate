import { describe, it, expect, vi } from "vitest";
import { ensureChromaCollection } from "./init";

describe("ensureChromaCollection", () => {
  it("invokes the collection provider (get-or-create is idempotent)", async () => {
    const getCollection = vi.fn(async () => ({}));
    await ensureChromaCollection(getCollection);
    expect(getCollection).toHaveBeenCalledTimes(1);
  });
});
