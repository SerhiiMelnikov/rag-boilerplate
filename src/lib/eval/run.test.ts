import { describe, it, expect, vi } from "vitest";
import { runEvaluation } from "./run";
import type { EvalRepo, ResultInput } from "./repo";
import type { EvalAggregate } from "./types";

// Mock params are explicitly typed (not just `() => {}`) so vitest infers a real
// `mock.calls` tuple type for each field — needed since assertions below index into
// `addResult`/`finishRun` calls (e.g. `repo.addResult.mock.calls[0][0]`). Deliberately
// left untyped as `EvalRepo` here (not just a partial mock): the object is cast to
// EvalRepo only at the call site (`asRepo`), since it doesn't implement every method.
function fakeRepo(over = {}) {
  return {
    listQuestions: vi.fn(async () => [
      { id: "q1", question: "what is a cat?", expectedDocumentIds: ["d1"], referenceAnswer: null, createdAt: new Date(0) },
    ]),
    setRunStatus: vi.fn(async (_id: string, _status: string) => {}),
    addResult: vi.fn(async (_input: ResultInput) => {}),
    finishRun: vi.fn(async (_id: string, _aggregate: EvalAggregate) => {}),
    failRun: vi.fn(async (_id: string, _error: string) => {}),
    ...over,
  };
}
function asRepo(repo: ReturnType<typeof fakeRepo>): EvalRepo {
  return repo as unknown as EvalRepo;
}
const settings = { systemPrompt: "sp", temperature: 0 } as never;

describe("runEvaluation", () => {
  it("scores a question and finishes done", async () => {
    const repo = fakeRepo();
    await runEvaluation("run-1", settings, {
      repo: asRepo(repo),
      prepareContextFn: vi.fn(async () => ({ hasContext: true, context: "cats are animals", sources: [{ documentId: "d1", filename: "cats.md", chunkId: "c1", score: 0.9 }] })),
      generateAnswer: vi.fn(async () => "A cat is an animal."),
      judge: vi.fn(async () => ({ score: 5, rationale: "grounded" })),
    });
    expect(repo.setRunStatus).toHaveBeenCalledWith("run-1", "running");
    const result = repo.addResult.mock.calls[0][0];
    expect(result).toMatchObject({ runId: "run-1", hit: true, recall: 1, judgeScore: 5 });
    expect(repo.finishRun).toHaveBeenCalled();
    const agg = repo.finishRun.mock.calls[0][1];
    expect(agg.questionCount).toBe(1);
    expect(repo.failRun).not.toHaveBeenCalled();
  });

  it("a single-question error is recorded and the run still finishes", async () => {
    const repo = fakeRepo();
    await runEvaluation("run-1", settings, {
      repo: asRepo(repo),
      prepareContextFn: vi.fn(async () => { throw new Error("embed failed"); }),
      generateAnswer: vi.fn(),
      judge: vi.fn(),
    });
    const result = repo.addResult.mock.calls[0][0];
    expect(result.error).toContain("embed failed");
    expect(result.judgeScore).toBeNull();
    expect(repo.finishRun).toHaveBeenCalled();
    expect(repo.failRun).not.toHaveBeenCalled();
  });

  it("an infra failure (listQuestions throws) fails the run", async () => {
    const repo = fakeRepo({ listQuestions: vi.fn(async () => { throw new Error("db down"); }) });
    await runEvaluation("run-1", settings, { repo: asRepo(repo), prepareContextFn: vi.fn(), generateAnswer: vi.fn(), judge: vi.fn() });
    expect(repo.failRun).toHaveBeenCalledWith("run-1", expect.stringContaining("db down"));
    expect(repo.finishRun).not.toHaveBeenCalled();
  });

  it("skips generation when there is no context (empty answer, judge still runs)", async () => {
    const repo = fakeRepo();
    const generateAnswer = vi.fn(async () => "should not be called");
    await runEvaluation("run-1", settings, {
      repo: asRepo(repo),
      prepareContextFn: vi.fn(async () => ({ hasContext: false, context: "", sources: [] })),
      generateAnswer,
      judge: vi.fn(async () => ({ score: 1, rationale: "no context" })),
    });
    expect(generateAnswer).not.toHaveBeenCalled();
    const result = repo.addResult.mock.calls[0][0];
    expect(result.generatedAnswer).toBe("");
    expect(result.hit).toBe(false);
  });
});
