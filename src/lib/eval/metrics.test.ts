import { describe, it, expect } from "vitest";
import { computeRetrievalMetrics, aggregateResults } from "./metrics";

describe("computeRetrievalMetrics", () => {
  it("full hit at rank 1", () => {
    expect(computeRetrievalMetrics(["a", "b"], ["a"])).toEqual({ hit: true, recall: 1, precision: 1 / 2, mrr: 1 });
  });
  it("partial recall, first expected at rank 2", () => {
    const m = computeRetrievalMetrics(["x", "a", "y"], ["a", "b"]);
    expect(m.hit).toBe(true);
    expect(m.recall).toBeCloseTo(1 / 2);
    expect(m.precision).toBeCloseTo(1 / 3);
    expect(m.mrr).toBeCloseTo(1 / 2);
  });
  it("no hit", () => {
    expect(computeRetrievalMetrics(["x", "y"], ["a"])).toEqual({ hit: false, recall: 0, precision: 0, mrr: 0 });
  });
  it("empty expected set → zeros, no divide-by-zero", () => {
    expect(computeRetrievalMetrics(["x"], [])).toEqual({ hit: false, recall: 0, precision: 0, mrr: 0 });
  });
  it("empty retrieved → zeros", () => {
    expect(computeRetrievalMetrics([], ["a"])).toEqual({ hit: false, recall: 0, precision: 0, mrr: 0 });
  });
});

describe("aggregateResults", () => {
  it("averages metrics; judge stats over judged only; pass = score>=4", () => {
    const agg = aggregateResults([
      { recall: 1, precision: 1, mrr: 1, judgeScore: 5 },
      { recall: 0, precision: 0, mrr: 0, judgeScore: 3 },
      { recall: 0.5, precision: 0.5, mrr: 0.5, judgeScore: null },
    ]);
    expect(agg.avgRecall).toBeCloseTo(0.5);
    expect(agg.questionCount).toBe(3);
    expect(agg.avgJudgeScore).toBeCloseTo(4); // (5+3)/2, null excluded
    expect(agg.passRate).toBeCloseTo(1 / 2); // one of two judged >= 4
  });
  it("empty input → all zeros", () => {
    expect(aggregateResults([])).toEqual({ avgRecall: 0, avgPrecision: 0, avgMrr: 0, avgJudgeScore: 0, passRate: 0, questionCount: 0 });
  });
});
