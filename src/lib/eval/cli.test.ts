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
  it("--help prints usage on stdout and exits 0", async () => {
    const { out, err, deps } = harness();
    expect(await runEvalCli(["--help"], deps)).toBe(0);
    expect(out.join("\n")).toContain("Usage: npm run eval");
    expect(err).toEqual([]);
  });

  it("-h behaves the same as --help", async () => {
    const { out, deps } = harness();
    expect(await runEvalCli(["-h"], deps)).toBe(0);
    expect(out.join("\n")).toContain("Usage: npm run eval");
  });

  // Without this a pipeline consuming --json gets silence on failure, and cannot
  // tell a crashed run from one that simply produced no output.
  it("--json emits a parseable error object when the run finishes with status error", async () => {
    const { out, deps } = harness({
      getRun: vi.fn(async () => ({ id: "run-1", status: "error", settingsSnapshot: SETTINGS, aggregate: null, error: "embed failed", createdAt: new Date(0) })),
    });
    expect(await runEvalCli(["--json"], deps)).toBe(1);
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0])).toEqual({ runId: "run-1", status: "error", error: "embed failed" });
  });

  it("--json emits a parseable error object when the run throws", async () => {
    const { out, deps } = harness();
    deps.runEval = vi.fn(async () => { throw new Error("provider exploded"); });
    expect(await runEvalCli(["--json"], deps)).toBe(1);
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0]).status).toBe("error");
    expect(JSON.parse(out[0]).error).toContain("provider exploded");
  });

  // The human output path must not start emitting JSON as a side effect.
  it("without --json an errored run still writes nothing to stdout", async () => {
    const { out, err, deps } = harness({
      getRun: vi.fn(async () => ({ id: "run-1", status: "error", settingsSnapshot: SETTINGS, aggregate: null, error: "embed failed", createdAt: new Date(0) })),
    });
    expect(await runEvalCli([], deps)).toBe(1);
    expect(out).toEqual([]);
    expect(err.join("\n")).toContain("embed failed");
  });

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

  // Guards the CLI side of the questions round trip: cli.ts already paid for
  // listQuestions() once (for the guard above and the "Running N question(s)"
  // message), so runEval must receive that same array instead of being left
  // to fetch its own copy.
  it("passes the already-fetched questions through to runEval", async () => {
    const h = harness();
    const code = await runEvalCli([], h.deps);
    expect(code).toBe(0);
    const questions = await h.repo.listQuestions.mock.results[0].value;
    expect(h.deps.runEval).toHaveBeenCalledWith("run-1", SETTINGS, { questions });
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

  // Same contract as the "run finishes with status error" and "run throws" cases
  // above: a pipeline reading --json must be able to tell a crashed/empty run from
  // silence, on every failure path, not just some of them.
  it("--json emits a parseable error object when there are no golden questions", async () => {
    const h = harness({ listQuestions: vi.fn(async () => []) });
    const code = await runEvalCli(["--json"], h.deps);
    expect(code).toBe(1);
    expect(h.err.join("\n")).toMatch(/question/i);
    expect(h.out).toHaveLength(1);
    const parsed = JSON.parse(h.out[0]);
    expect(parsed.status).toBe("error");
    expect(parsed.error).toMatch(/question/i);
  });

  it("exits 1 when the run itself errored", async () => {
    const h = harness({
      getRun: vi.fn(async () => ({ id: "run-1", status: "error", settingsSnapshot: SETTINGS, aggregate: null, error: "provider exploded", createdAt: new Date(0) })),
    });
    const code = await runEvalCli([], h.deps);
    expect(code).toBe(1);
    expect(h.err.join("\n")).toContain("provider exploded");
  });

  it("exits 1 when the run disappears while executing", async () => {
    const h = harness({ getRun: vi.fn(async () => null) });
    const code = await runEvalCli([], h.deps);
    expect(code).toBe(1);
    expect(h.err.join("\n")).toContain("disappeared");
    expect(h.out).toEqual([]);
  });

  it("--json emits a parseable error object when the run disappears while executing", async () => {
    const h = harness({ getRun: vi.fn(async () => null) });
    const code = await runEvalCli(["--json"], h.deps);
    expect(code).toBe(1);
    expect(h.err.join("\n")).toContain("disappeared");
    expect(h.out).toHaveLength(1);
    const parsed = JSON.parse(h.out[0]);
    expect(parsed.status).toBe("error");
    expect(parsed.error).toContain("disappeared");
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

  // Every awaited repo call must sit inside the guard, not just the two above:
  // a refactor that moved one outside would turn a database blip back into an
  // unhandled rejection, which is the failure this module exists to prevent.
  // --json is requested throughout: any of these lands in the same outer catch
  // as "the run throws" above, so it must produce the same single parseable
  // error line on stdout rather than staying silent.
  it.each(["listQuestions", "createRun", "getRun", "getResults"] as const)(
    "resolves to 1 instead of rejecting when repo.%s throws",
    async (method) => {
      const h = harness({ [method]: vi.fn(async () => { throw new Error(`${method} exploded`); }) });
      await expect(runEvalCli(["--json"], h.deps)).resolves.toBe(1);
      expect(h.err.join("\n")).toContain(`${method} exploded`);
      expect(h.out).toHaveLength(1);
      expect(JSON.parse(h.out[0])).toEqual({ status: "error", error: `${method} exploded` });
    },
  );

  it("resolves to 1 instead of rejecting when getSettings throws", async () => {
    const h = harness();
    h.deps.getSettings = async () => { throw new Error("settings unavailable"); };
    await expect(runEvalCli(["--json"], h.deps)).resolves.toBe(1);
    expect(h.err.join("\n")).toContain("settings unavailable");
    expect(h.out).toHaveLength(1);
    expect(JSON.parse(h.out[0])).toEqual({ status: "error", error: "settings unavailable" });
  });
});
