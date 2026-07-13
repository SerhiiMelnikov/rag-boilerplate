import { describe, it, expect, vi } from "vitest";
import { ensureDefaultWorkspace } from "./ensure-default";

// Stateful fake db, so the race path is actually reachable: `insertWins` decides whether
// our INSERT ... ON CONFLICT DO NOTHING returns a row (we won) or nothing (a concurrent
// seed committed first), and a later SELECT sees whatever ended up committed.
function fakeDb({ row, insertWins = true }: { row: { id: string } | null; insertWins?: boolean }) {
  const state = { row };
  const values = vi.fn(() => ({
    onConflictDoNothing: () => ({
      returning: async () => {
        if (insertWins) {
          state.row = { id: "new-general" };
          return [state.row];
        }
        // Lost the race: the other seed's row is committed by the time we look again.
        state.row = { id: "raced-in" };
        return [];
      },
    }),
  }));
  return {
    _values: values,
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (state.row ? [state.row] : []) }) }) }),
    insert: () => ({ values }),
  } as never;
}

describe("ensureDefaultWorkspace", () => {
  it("creates General when the workspace table is empty", async () => {
    const db = fakeDb({ row: null });
    expect(await ensureDefaultWorkspace(db)).toBe("new-general");
    expect((db as never as { _values: ReturnType<typeof vi.fn> })._values).toHaveBeenCalledWith({ name: "General", isDefault: true });
  });

  // Every install runs the seed script, and a scaffolded project may run it repeatedly.
  it("is idempotent: an existing default is reused, not duplicated", async () => {
    const db = fakeDb({ row: { id: "already-there" } });
    expect(await ensureDefaultWorkspace(db)).toBe("already-there");
    expect((db as never as { _values: ReturnType<typeof vi.fn> })._values).not.toHaveBeenCalled();
  });

  // Two seeds racing: ON CONFLICT DO NOTHING gives the loser no row back, so it must
  // read the winner's row rather than fail.
  it("reads back the winner's row when a concurrent seed inserted first", async () => {
    const db = fakeDb({ row: null, insertWins: false });
    expect(await ensureDefaultWorkspace(db)).toBe("raced-in");
  });

  it("fails loudly if the row is still missing after the insert", async () => {
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [] }) }) }),
    } as never;
    await expect(ensureDefaultWorkspace(db)).rejects.toThrow(/could not create the default/i);
  });
});
