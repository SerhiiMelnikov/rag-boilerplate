import { describe, it, expect } from "vitest";
import { paginate, PAGE_SIZES, DEFAULT_PAGE_SIZE } from "./pagination";

const items = Array.from({ length: 47 }, (_, i) => i + 1);

describe("paginate", () => {
  it("returns the first page and a 1-based inclusive range", () => {
    const p = paginate(items, 1, 10);
    expect(p.rows).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([p.from, p.to, p.pageCount, p.page]).toEqual([1, 10, 5, 1]);
  });

  it("returns a short last page", () => {
    const p = paginate(items, 5, 10);
    expect(p.rows).toEqual([41, 42, 43, 44, 45, 46, 47]);
    expect([p.from, p.to]).toEqual([41, 47]);
  });

  // The whole reason clamping lives in the computation: a filter that shortens the
  // list while the admin sits on page 4 would otherwise render an empty table with
  // both paging buttons dead — no control left to escape with.
  it("clamps a page past the end onto the last one, with rows on it", () => {
    const p = paginate(items.slice(0, 12), 4, 10);
    expect(p.page).toBe(2);
    expect(p.rows).toEqual([11, 12]);
    expect(p.rows.length).toBeGreaterThan(0);
  });

  it("clamps a page below one", () => {
    expect(paginate(items, 0, 10).page).toBe(1);
    expect(paginate(items, -3, 10).page).toBe(1);
  });

  // "1–0 of 0" reads as broken; callers hide the bar entirely, and this is what
  // lets them do that without a second emptiness check.
  it("reports a zero range for an empty list, and still offers one page", () => {
    const p = paginate([], 1, 10);
    expect([p.from, p.to, p.pageCount, p.rows.length]).toEqual([0, 0, 1, 0]);
  });

  it("fits everything on one page when the size exceeds the list", () => {
    const p = paginate(items, 1, 50);
    expect(p.rows).toHaveLength(47);
    expect(p.pageCount).toBe(1);
  });

  it("offers the sizes the admin screens advertise, and starts at the smallest", () => {
    expect([...PAGE_SIZES]).toEqual([10, 20, 30, 50]);
    expect(DEFAULT_PAGE_SIZE).toBe(10);
    expect(PAGE_SIZES).toContain(DEFAULT_PAGE_SIZE);
  });
});
