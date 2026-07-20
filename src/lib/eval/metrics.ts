import type { EvalAggregate } from "./types";

export interface QuestionMetrics {
  hit: boolean;
  recall: number;
  precision: number;
  mrr: number;
}

// Document-level. `retrievedDocIds` must be unique and in retrieval rank order.
export function computeRetrievalMetrics(retrievedDocIds: string[], expectedDocIds: string[]): QuestionMetrics {
  const expected = new Set(expectedDocIds);
  const retrievedSet = new Set(retrievedDocIds);
  const intersection = [...expected].filter((d) => retrievedSet.has(d)).length;
  const recall = expected.size === 0 ? 0 : intersection / expected.size;
  const precision = retrievedDocIds.length === 0 ? 0 : intersection / retrievedDocIds.length;
  let mrr = 0;
  for (let i = 0; i < retrievedDocIds.length; i++) {
    if (expected.has(retrievedDocIds[i])) { mrr = 1 / (i + 1); break; }
  }
  return { hit: intersection > 0, recall, precision, mrr };
}

export interface AggregateInput {
  recall: number;
  precision: number;
  mrr: number;
  judgeScore: number | null;
}

export function aggregateResults(items: AggregateInput[]): EvalAggregate {
  const n = items.length;
  const mean = (f: (i: AggregateInput) => number) => (n === 0 ? 0 : items.reduce((s, i) => s + f(i), 0) / n);
  const judged = items.filter((i): i is AggregateInput & { judgeScore: number } => i.judgeScore != null);
  const avgJudgeScore = judged.length === 0 ? 0 : judged.reduce((s, i) => s + i.judgeScore, 0) / judged.length;
  const passRate = judged.length === 0 ? 0 : judged.filter((i) => i.judgeScore >= 4).length / judged.length;
  return {
    avgRecall: mean((i) => i.recall),
    avgPrecision: mean((i) => i.precision),
    avgMrr: mean((i) => i.mrr),
    avgJudgeScore,
    passRate,
    questionCount: n,
  };
}
