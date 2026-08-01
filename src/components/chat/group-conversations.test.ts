import { describe, it, expect } from "vitest";
import { groupConversations } from "./group-conversations";

// A fixed local clock: never Date.now(), or the boundary cases become a coin flip
// depending on when CI happens to run.
const now = new Date(2026, 7, 1, 9, 30); // 2026-08-01 09:30 local

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m, d, h, min).toISOString();

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
    const groups = groupConversations([{ id: "a", createdAt: at(2026, 6, 31, 23, 59) }], now);
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

  it("returns groups in fixed order regardless of input order", () => {
    const groups = groupConversations(
      [
        { id: "d", createdAt: at(2026, 5, 2) },
        { id: "c", createdAt: at(2026, 6, 28) },
        { id: "b", createdAt: at(2026, 6, 31, 22) },
        { id: "a", createdAt: at(2026, 7, 1, 8) },
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

  it("distinguishes midnight boundary: exactly midnight is today, 23:59 is yesterday", () => {
    const midnight = at(2026, 7, 1, 0, 0);
    const almostMidnight = at(2026, 6, 31, 23, 59);
    const groups = groupConversations(
      [
        { id: "midnight", createdAt: midnight },
        { id: "almostMidnight", createdAt: almostMidnight },
      ],
      now,
    );
    const items = Object.fromEntries(groups.flatMap((g) => g.items.map((i) => [i.id, g.key])));
    expect(items["midnight"]).toBe("today");
    expect(items["almostMidnight"]).toBe("yesterday");
  });

  it("distinguishes day -7 (previous7) from day -8 (earlier)", () => {
    const day7 = at(2026, 6, 25, 12); // 7 days ago: 2026-06-25
    const day8 = at(2026, 6, 24, 12); // 8 days ago: 2026-06-24
    const groups = groupConversations(
      [
        { id: "day7", createdAt: day7 },
        { id: "day8", createdAt: day8 },
      ],
      now,
    );
    const items = Object.fromEntries(groups.flatMap((g) => g.items.map((i) => [i.id, g.key])));
    expect(items["day7"]).toBe("previous7");
    expect(items["day8"]).toBe("earlier");
  });

  it("includes malformed createdAt in earlier, does not drop it", () => {
    const groups = groupConversations(
      [
        { id: "valid", createdAt: at(2026, 5, 2) },
        { id: "malformed", createdAt: "nonsense" },
      ],
      now,
    );
    const items = Object.fromEntries(groups.flatMap((g) => g.items.map((i) => [i.id, g.key])));
    expect(items["malformed"]).toBe("earlier");
    expect(items["valid"]).toBe("earlier");
  });
});
