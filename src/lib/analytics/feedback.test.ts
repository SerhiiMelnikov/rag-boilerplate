import { describe, it, expect, vi } from "vitest";
import {
  satisfaction,
  getFeedbackSummary,
  getRecentNegative,
  getDocumentQuality,
  getSatisfactionTrend,
} from "@/lib/analytics/feedback";

// The service issues raw db.execute(sql`...`) calls; mock execute to return canned rows.
const dbWith = (rows: unknown[]) => ({ execute: vi.fn(async () => rows) }) as never;

describe("satisfaction", () => {
  it("is 0 when there are no ratings", () => expect(satisfaction(0, 0)).toBe(0));
  it("computes up/(up+down)", () => expect(satisfaction(3, 1)).toBe(0.75));
});

describe("getFeedbackSummary", () => {
  it("maps counts and computes satisfaction", async () => {
    const db = dbWith([{ total: 10, rated: 4, up: 3, down: 1, unrated: 6 }]);
    expect(await getFeedbackSummary(db)).toEqual({ total: 10, rated: 4, up: 3, down: 1, unrated: 6, satisfaction: 0.75 });
  });
  it("handles an empty table (no rows) → zeros, satisfaction 0", async () => {
    expect(await getFeedbackSummary(dbWith([]))).toEqual({ total: 0, rated: 0, up: 0, down: 0, unrated: 0, satisfaction: 0 });
  });
  it("coerces string counts from the driver", async () => {
    const s = await getFeedbackSummary(dbWith([{ total: "2", rated: "2", up: "1", down: "1", unrated: "0" }]));
    expect(s.total).toBe(2);
    expect(s.satisfaction).toBe(0.5);
  });
});

describe("getRecentNegative", () => {
  it("maps rows, dedups source filenames, keeps null question, parses date", async () => {
    const db = dbWith([
      { id: "m1", answer: "bad", createdAt: "2026-07-01T00:00:00Z", sources: [{ filename: "a.md" }, { filename: "a.md" }, { filename: "b.md" }], question: "why?" },
      { id: "m2", answer: "worse", createdAt: "2026-07-01T00:00:00Z", sources: [], question: null },
    ]);
    const out = await getRecentNegative(20, db);
    expect(out[0]).toMatchObject({ id: "m1", question: "why?", answer: "bad", filenames: ["a.md", "b.md"] });
    expect(out[0].createdAt).toBeInstanceOf(Date);
    expect(out[1]).toMatchObject({ id: "m2", question: null, filenames: [] });
  });
});

describe("getDocumentQuality", () => {
  it("counts a document once per answer even when cited via multiple chunks", async () => {
    const db = dbWith([
      // one downvoted answer (m1) citing d1 via TWO chunks + d2 via one chunk
      { messageId: "m1", rating: -1, createdAt: "2026-07-02T00:00:00Z", documentId: "d1", filename: "a.md" },
      { messageId: "m1", rating: -1, createdAt: "2026-07-02T00:00:00Z", documentId: "d1", filename: "a.md" },
      { messageId: "m1", rating: -1, createdAt: "2026-07-02T00:00:00Z", documentId: "d2", filename: "b.md" },
      // one upvoted answer (m2) citing d1 once
      { messageId: "m2", rating: 1, createdAt: "2026-07-01T00:00:00Z", documentId: "d1", filename: "a.md" },
    ]);
    const out = await getDocumentQuality(db);
    const d1 = out.find((r) => r.documentId === "d1")!;
    expect(d1).toMatchObject({ appearances: 2, up: 1, down: 1, satisfaction: 0.5, filename: "a.md" });
    const d2 = out.find((r) => r.documentId === "d2")!;
    expect(d2).toMatchObject({ appearances: 1, up: 0, down: 1, satisfaction: 0 });
    // down ties (1 vs 1) → break by appearances desc → d1 first
    expect(out[0].documentId).toBe("d1");
  });
  it("returns [] when there is no data", async () => {
    expect(await getDocumentQuality(dbWith([]))).toEqual([]);
  });
});

describe("getSatisfactionTrend", () => {
  it("maps daily buckets with satisfaction", async () => {
    const db = dbWith([{ day: "2026-07-01", up: 2, down: 2 }]);
    expect(await getSatisfactionTrend(db)).toEqual([{ day: "2026-07-01", up: 2, down: 2, satisfaction: 0.5 }]);
  });
  it("returns [] when there is no data", async () => {
    expect(await getSatisfactionTrend(dbWith([]))).toEqual([]);
  });
});
