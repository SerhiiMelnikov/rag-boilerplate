import { describe, it, expect } from "vitest";
import { groupConversations } from "./group-conversations";

// A fixed local clock: never Date.now(), or the boundary cases become a coin flip
// depending on when CI happens to run.
const now = new Date(2026, 7, 1, 9, 30); // 2026-08-01 09:30 local

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();

describe("groupConversations", () => {
  it("splits today, yesterday, the last week and the rest", () => {
    const groups = groupConversations(
      [
        { id: "a", createdAt: at(2026, 7, 1, 8) },
        { id: "b", createdAt: at(2026, 6, 31, 22) },
        { id: "c", createdAt: at(2026, 6, 28) },
        { id: "d", createdAt: at(2026, 5, 2) },
      ],
      now,
    );
    expect(groups.map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
      ["today", ["a"]],
      ["yesterday", ["b"]],
      ["previous7", ["c"]],
      ["earlier", ["d"]],
    ]);
  });

  it("puts one minute before local midnight in yesterday, not today", () => {
    const groups = groupConversations([{ id: "a", createdAt: at(2026, 6, 31, 23) }], now);
    expect(groups[0].key).toBe("yesterday");
  });

  it("omits empty groups and keeps the input order", () => {
    const groups = groupConversations(
      [
        { id: "a", createdAt: at(2026, 7, 1, 9) },
        { id: "b", createdAt: at(2026, 7, 1, 8) },
      ],
      now,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupConversations([], now)).toEqual([]);
  });

  it("labels each group for the panel heading", () => {
    const groups = groupConversations([{ id: "a", createdAt: at(2026, 5, 2) }], now);
    expect(groups[0].label).toBe("Earlier");
  });
});
