import { describe, it, expect, vi } from "vitest";
import { runEvalCli } from "./cli";
import type { EvalRepo } from "./repo";

const SETTINGS = { topK: 5, minSimilarity: 0.3, contextTokenBudget: 3000, chatProvider: "google", chatModel: "gemini", embeddingProvider: "google", embeddingModel: "emb", temperature: 0.2, systemPrompt: "sp" } as never;

const AGGREGATE = { avgRecall: 0.8, avgPrecision: 0.6, avgMrr: 0.5, avgJudgeScore: 4.2, passRate: 0.75, questionCount: 2 };

const RESULTS = [
  { id: "res1", questionId: "q1", questionText: "What is the refund policy?", retrieved: [], hit: true, recall: 1, precision: 0.5, mrr: 1, judgeScore: 5, judgeRationale: "ok", generatedAnswer: "a", error: null },
  { id: "res2", questionId: "q2", questionText: "Where is the office?", retrieved: [], hit: false, recall: 0, precision: 0, mrr: 0, judgeScore: 3, judgeRationale: "weak", generatedAnswer: "b", error: null },
];

// A repo whose run settles to `status` once the (stubbed) evaluation has run.
function fakeRepo(over: Record<string, unknown> = {}) {
  return {
    listQuestions: vi.fn(async () => [{ id: "q1", question: "q", expectedDocumentIds: [], referenceAnswer: null, createdAt: new Date(0) }]),
    createRun: vi.fn(async () => ({ id: "run-1" })),
    getRun: vi.fn(async () => ({ id: "run-1", status: "done", settingsSnapshot: SETTINGS, aggregate: AGGREGATE, error: null, createdAt: new Date(0) })),
    getResults: vi.fn(async () => RESULTS),
    ...over,
  };
}

// Collect what the CLI writes, so assertions can distinguish stdout from stderr.
function harness(repoOver: Record<string, unknown> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const repo = fakeRepo(repoOver);
  return {
    out, err, repo,
    deps: {
      repo: repo as unknown as EvalRepo,
      getSettings: async () => SETTINGS,
      runEval: vi.fn(async () => {}),
      out: (l: string) => out.push(l),
      err: (l: string) => err.push(l),
    },
  };
}

describe("runEvalCli", () => {
  it("runs an evaluation and reports the aggregate and one row per question", async () => {
    const h = harness();
    const code = await runEvalCli([], h.deps);
    expect(code).toBe(0);
    expect(h.repo.createRun).toHaveBeenCalled();
    const text = h.out.join("\n");
    // Each assertion is tied to its label (with the exact spacing reportLines
    // produces) so a transposed avgRecall/avgPrecision fails the test instead
    // of the same 80%/60% numbers passing on the other line.
    expect(text).toContain("Recall     80%");
    expect(text).toContain("Precision  60%");
    expect(text).toContain("Judge      4.2/5");
    // Per-question row: columns must appear in the order the header
    // advertises (hit, recall, prec, mrr, judge, question).
    expect(text).toContain("yes  100%    50%     100%    5/5    What is the refund policy?");
    expect(text).toContain("no   0%      0%      0%      3/5    Where is the office?");
  });

  it("--json writes one JSON object and nothing else to stdout", async () => {
    const h = harness();
    const code = await runEvalCli(["--json"], h.deps);
    expect(code).toBe(0);
    // The whole of stdout must parse — anything else on it breaks piping.
    const parsed = JSON.parse(h.out.join("\n"));
    expect(parsed).toMatchObject({ runId: "run-1", status: "done", aggregate: AGGREGATE });
    expect(parsed.results).toHaveLength(2);
  });

  it("exits 1 when a threshold is not met, naming it", async () => {
    const h = harness();
    const code = await runEvalCli(["--min-judge", "4.5"], h.deps);
    expect(code).toBe(1);
    expect(h.err.join("\n")).toMatch(/min-judge/);
  });

  it("exits 0 when every threshold is met", async () => {
    const h = harness();
    expect(await runEvalCli(["--min-judge", "4", "--min-recall", "0.8"], h.deps)).toBe(0);
  });

  it("exits 1 with no golden questions rather than passing green", async () => {
    const h = harness({ listQuestions: vi.fn(async () => []) });
    const code = await runEvalCli([], h.deps);
    expect(code).toBe(1);
    expect(h.repo.createRun).not.toHaveBeenCalled();
    expect(h.err.join("\n")).toMatch(/question/i);
  });

  it("exits 1 when the run itself errored", async () => {
    const h = harness({
      getRun: vi.fn(async () => ({ id: "run-1", status: "error", settingsSnapshot: SETTINGS, aggregate: null, error: "provider exploded", createdAt: new Date(0) })),
    });
    const code = await runEvalCli([], h.deps);
    expect(code).toBe(1);
    expect(h.err.join("\n")).toContain("provider exploded");
  });

  it("rejects a non-numeric or blank threshold instead of ignoring it", async () => {
    // "   " would coerce to 0 via Number(), silently becoming an always-passing
    // threshold — the exact no-op the adjacent comment warns against.
    for (const raw of ["high", "   "]) {
      const h = harness();
      const code = await runEvalCli(["--min-judge", raw], h.deps);
      expect(code).toBe(1);
      expect(h.repo.createRun).not.toHaveBeenCalled();
      expect(h.err.join("\n")).toMatch(/--min-judge/);
    }
  });

  it("resolves to 1 instead of rejecting when the repo throws", async () => {
    const h = harness({ createRun: vi.fn(async () => { throw new Error("db connection lost"); }) });
    await expect(runEvalCli([], h.deps)).resolves.toBe(1);
    expect(h.err.join("\n")).toContain("db connection lost");
    expect(h.out.join("\n")).not.toContain("db connection lost");
  });

  it("resolves to 1 instead of rejecting when runEval throws", async () => {
    const h = harness();
    h.deps.runEval = vi.fn(async () => { throw new Error("provider outage"); });
    await expect(runEvalCli([], h.deps)).resolves.toBe(1);
    expect(h.err.join("\n")).toContain("provider outage");
    expect(h.out.join("\n")).not.toContain("provider outage");
  });
});
