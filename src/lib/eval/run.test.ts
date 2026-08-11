import { describe, it, expect, vi } from "vitest";
import { runEvaluation } from "./run";
import { evalRepo } from "./repo";
import type { EvalRepo, ResultInput } from "./repo";
import type { EvalAggregate } from "./types";
import { buildAnswerSystemPrompt } from "@/lib/chat/answer-prompt";

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

  // The eval harness must score answers against exactly the prompt production uses.
  // Before 0.6.4 it carried its own copy of the grounding clause, already differing
  // from the handler's by a word.
  it("builds generateAnswer's system prompt through the shared builder", async () => {
    const repo = fakeRepo();
    const generateAnswer = vi.fn(async () => "A cat is an animal.");
    await runEvaluation("run-1", settings, {
      repo: asRepo(repo),
      prepareContextFn: vi.fn(async () => ({ hasContext: true, context: "cats are animals", sources: [{ documentId: "d1", filename: "cats.md", chunkId: "c1", score: 0.9 }] })),
      generateAnswer,
      judge: vi.fn(async () => ({ score: 5, rationale: "grounded" })),
    });
    expect(generateAnswer).toHaveBeenCalledWith(
      buildAnswerSystemPrompt({ systemPrompt: "sp", context: "cats are animals", hasContext: true }),
      "what is a cat?",
      settings,
    );
  });

  it("uses pre-fetched questions instead of querying again", async () => {
    const repo = fakeRepo();
    await runEvaluation("run-1", settings, {
      repo: asRepo(repo),
      questions: [{ id: "q1", question: "what is a cat?", expectedDocumentIds: ["d1"], referenceAnswer: null, createdAt: new Date(0) }],
      prepareContextFn: vi.fn(async () => ({ hasContext: true, context: "cats are animals", sources: [{ documentId: "d1", filename: "cats.md", chunkId: "c1", score: 0.9 }] })),
      generateAnswer: vi.fn(async () => "A cat is an animal."),
      judge: vi.fn(async () => ({ score: 5, rationale: "grounded" })),
    });
    expect(repo.listQuestions).not.toHaveBeenCalled();
    expect(repo.addResult).toHaveBeenCalledTimes(1);
  });

  // The admin panel's background path supplies none, and must keep working.
  it("still fetches its own questions when none are supplied", async () => {
    const repo = fakeRepo();
    await runEvaluation("run-1", settings, {
      repo: asRepo(repo),
      prepareContextFn: vi.fn(async () => ({ hasContext: true, context: "cats are animals", sources: [{ documentId: "d1", filename: "cats.md", chunkId: "c1", score: 0.9 }] })),
      generateAnswer: vi.fn(async () => "A cat is an animal."),
      judge: vi.fn(async () => ({ score: 5, rationale: "grounded" })),
    });
    expect(repo.listQuestions).toHaveBeenCalled();
  });

  it("keeps going when the failure row itself cannot be written", async () => {
    // Silence the deliberate console.error this path emits.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = fakeRepo({
      listQuestions: vi.fn(async () => [
        { id: "q1", question: "first?", expectedDocumentIds: ["d1"], referenceAnswer: null, createdAt: new Date(0) },
        { id: "q2", question: "second?", expectedDocumentIds: ["d2"], referenceAnswer: null, createdAt: new Date(0) },
      ]),
      // The database is down for error rows specifically — the shape of a real
      // outage that hits mid-run, after some questions already succeeded.
      addResult: vi.fn(async (input: ResultInput) => { if (input.error) throw new Error("db is down"); }),
    });
    let firstQuestion = true;
    await runEvaluation("run-1", settings, {
      repo: asRepo(repo),
      prepareContextFn: vi.fn(async () => {
        if (firstQuestion) {
          firstQuestion = false;
          return { hasContext: true, context: "c", sources: [{ documentId: "d1", filename: "a.md", chunkId: "c1", score: 0.9 }] };
        }
        throw new Error("embed failed");
      }),
      generateAnswer: vi.fn(async () => "an answer"),
      judge: vi.fn(async () => ({ score: 5, rationale: "ok" })),
    });

    expect(repo.failRun).not.toHaveBeenCalled();
    expect(repo.finishRun).toHaveBeenCalled();
    // The aggregate describes exactly the rows that were stored — the question
    // whose row could not be written is not counted.
    expect(repo.finishRun.mock.calls[0][1].questionCount).toBe(1);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("does not record a synthetic failure when only the success write fails", async () => {
    // Silence the deliberate console.error this path emits.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const added: ResultInput[] = [];
    const repo = fakeRepo({
      addResult: vi.fn(async (input: ResultInput) => {
        added.push(input);
        if (input.error === null) throw new Error("write failed");
      }),
    });
    await runEvaluation("run-1", settings, {
      repo: asRepo(repo),
      prepareContextFn: vi.fn(async () => ({ hasContext: true, context: "cats are animals", sources: [{ documentId: "d1", filename: "cats.md", chunkId: "c1", score: 0.9 }] })),
      generateAnswer: vi.fn(async () => "A cat is an animal."),
      judge: vi.fn(async () => ({ score: 5, rationale: "grounded" })),
    });

    // Exactly one attempt: the successful result. The catch built for compute
    // failures (prepareContext/generateAnswer/judge throwing) must not have run
    // and written a second, error-shaped row over a question that was in fact
    // answered and judged correctly.
    expect(added).toHaveLength(1);
    expect(added[0].error).toBeNull();
    expect(repo.failRun).not.toHaveBeenCalled();
    expect(repo.finishRun).toHaveBeenCalled();
    // Nothing to aggregate: the write failed, so this question contributes no
    // row and no aggregate entry, same rule the compute-failure catch follows.
    expect(repo.finishRun.mock.calls[0][1].questionCount).toBe(0);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  // Regression test for the interaction between run.ts's outer per-question
  // try/catch and repo.ts's real addResult: this deliberately uses the REAL
  // evalRepo.addResult (bound to a fake db whose heartbeat update throws),
  // not a mock that reimplements it, so a regression in addResult's own
  // try/catch would actually be caught here.
  it("a heartbeat-write failure does not make run.ts record a duplicate failure row", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const inserted: unknown[] = [];
    const fakeDb = {
      insert: () => ({
        values: (v: unknown) => {
          inserted.push(v);
          return Promise.resolve(undefined);
        },
      }),
      update: () => ({
        set: () => ({
          where: async () => {
            throw new Error("heartbeat db down");
          },
        }),
      }),
    } as never;
    const repo = fakeRepo({
      addResult: vi.fn((input: ResultInput) => evalRepo.addResult(input, fakeDb)),
    });
    await runEvaluation("run-1", settings, {
      repo: asRepo(repo),
      prepareContextFn: vi.fn(async () => ({ hasContext: true, context: "cats are animals", sources: [{ documentId: "d1", filename: "cats.md", chunkId: "c1", score: 0.9 }] })),
      generateAnswer: vi.fn(async () => "A cat is an animal."),
      judge: vi.fn(async () => ({ score: 5, rationale: "grounded" })),
    });
    // If the heartbeat failure propagated out of addResult, run.ts's outer catch
    // would treat the question as failed and call addResult a second time,
    // inserting a spurious duplicate eval_results row. It must not: exactly one
    // call, exactly one insert, and the run finishes normally rather than
    // failing the question.
    expect(repo.addResult).toHaveBeenCalledTimes(1);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ runId: "run-1", hit: true });
    expect(repo.failRun).not.toHaveBeenCalled();
    expect(repo.finishRun).toHaveBeenCalled();
    expect(repo.finishRun.mock.calls[0][1].questionCount).toBe(1);
    logged.mockRestore();
  });
});
