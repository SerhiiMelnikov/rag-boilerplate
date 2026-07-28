import { describe, it, expect, vi } from "vitest";
import {
  getUsageSummary,
  getUsageByUser,
  getUsageByWorkspace,
  getUsageTrend,
} from "@/lib/analytics/usage";

// The service issues raw db.execute(sql`...`) calls; mock execute to return canned rows.
const dbWith = (rows: unknown[]) => ({ execute: vi.fn(async () => rows) }) as never;

describe("getUsageSummary", () => {
  it("maps a row and derives totalTokens as the sum", async () => {
    const db = dbWith([{ promptTokens: 100, completionTokens: 40, answers: 5 }]);
    expect(await getUsageSummary(db)).toEqual({ promptTokens: 100, completionTokens: 40, totalTokens: 140, answers: 5 });
  });

  it("handles an empty table (no rows) → zeros, no crash", async () => {
    expect(await getUsageSummary(dbWith([]))).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0, answers: 0 });
  });

  it("coerces string counts from the driver instead of concatenating them", async () => {
    const s = await getUsageSummary(dbWith([{ promptTokens: "10", completionTokens: "5", answers: "2" }]));
    expect(s).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15, answers: 2 });
  });
});

describe("getUsageByUser", () => {
  it("maps id/label and derives totals per row", async () => {
    const db = dbWith([
      { id: "u1", label: "alice@example.com", promptTokens: 200, completionTokens: 50, answers: 4 },
      { id: "u2", label: "bob@example.com", promptTokens: 30, completionTokens: 10, answers: 1 },
    ]);
    expect(await getUsageByUser(db)).toEqual([
      { id: "u1", label: "alice@example.com", promptTokens: 200, completionTokens: 50, totalTokens: 250, answers: 4 },
      { id: "u2", label: "bob@example.com", promptTokens: 30, completionTokens: 10, totalTokens: 40, answers: 1 },
    ]);
  });

  it("returns [] when there is no data", async () => {
    expect(await getUsageByUser(dbWith([]))).toEqual([]);
  });
});

describe("getUsageByWorkspace", () => {
  it("maps a null id to null (not the string \"null\") and keeps the supplied label", async () => {
    const db = dbWith([
      { id: "w1", label: "Engineering", promptTokens: 90, completionTokens: 30, answers: 3 },
      { id: null, label: "Unassigned", promptTokens: 12, completionTokens: 4, answers: 1 },
    ]);
    const rows = await getUsageByWorkspace(db);
    expect(rows[0]).toEqual({ id: "w1", label: "Engineering", promptTokens: 90, completionTokens: 30, totalTokens: 120, answers: 3 });
    expect(rows[1]).toEqual({ id: null, label: "Unassigned", promptTokens: 12, completionTokens: 4, totalTokens: 16, answers: 1 });
    expect(rows[1].id).not.toBe("null");
  });

  it("returns [] when there is no data", async () => {
    expect(await getUsageByWorkspace(dbWith([]))).toEqual([]);
  });
});

describe("getUsageTrend", () => {
  it("maps day and derives totalTokens", async () => {
    const db = dbWith([{ day: "2026-07-01", promptTokens: 80, completionTokens: 20 }]);
    expect(await getUsageTrend(db)).toEqual([{ day: "2026-07-01", promptTokens: 80, completionTokens: 20, totalTokens: 100 }]);
  });

  it("returns [] when there is no data", async () => {
    expect(await getUsageTrend(dbWith([]))).toEqual([]);
  });
});
