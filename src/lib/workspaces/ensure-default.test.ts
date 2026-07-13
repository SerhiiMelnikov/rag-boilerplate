import { describe, it, expect, vi } from "vitest";
import { ensureDefaultWorkspace } from "./ensure-default";

// Fake db: `existing` is what the lookup finds (null = none yet).
function fakeDb(existing: { id: string } | null) {
  const values = vi.fn(() => ({ onConflictDoNothing: () => ({ returning: async () => (existing ? [] : [{ id: "new-general" }]) }) }));
  return {
    _values: values,
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (existing ? [existing] : []) }) }) }),
    insert: () => ({ values }),
  } as never;
}

describe("ensureDefaultWorkspace", () => {
  it("creates General when the workspace table is empty", async () => {
    const db = fakeDb(null);
    expect(await ensureDefaultWorkspace(db)).toBe("new-general");
    expect((db as any)._values).toHaveBeenCalledWith({ name: "General", isDefault: true });
  });

  // Every install runs the seed script, and a scaffolded project may run it repeatedly.
  it("is idempotent: an existing default is reused, not duplicated", async () => {
    const db = fakeDb({ id: "already-there" });
    expect(await ensureDefaultWorkspace(db)).toBe("already-there");
    expect((db as any)._values).not.toHaveBeenCalled();
  });
});
