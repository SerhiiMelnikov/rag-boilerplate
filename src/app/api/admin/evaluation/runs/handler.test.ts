import { describe, it, expect, vi } from "vitest";
import { createRunResponse, listRunsResponse, getRunResponse } from "./handler";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/guards";

const admin = vi.fn(async () => ({ id: "a1", role: "admin", isSuperAdmin: false }));

// Only the fields the handler's snapshot() helper picks off RuntimeSettings.
const settings = {
  topK: 5,
  minSimilarity: 0.7,
  contextTokenBudget: 4000,
  chatProvider: "google",
  chatModel: "gemini-2.0-flash",
  embeddingProvider: "google",
  embeddingModel: "text-embedding-004",
  temperature: 0.3,
  systemPrompt: "You are a helpful assistant.",
};

const run = {
  id: "r1",
  status: "pending" as const,
  settingsSnapshot: settings,
  aggregate: null,
  error: null,
  createdAt: new Date(0),
};

describe("admin guard", () => {
  it("403s a forbidden (non-admin) caller on list and does not touch the repo", async () => {
    const forbidden = vi.fn(async () => { throw new ForbiddenError(); });
    const listRuns = vi.fn(async () => [run]);
    const res = await listRunsResponse({ getAdmin: forbidden as never, repo: { listRuns } as never });
    expect(res.status).toBe(403);
    expect(listRuns).not.toHaveBeenCalled();
  });

  it("401s an unauthenticated caller on create and does not touch the repo or schedule the job", async () => {
    const unauthorized = vi.fn(async () => { throw new UnauthorizedError(); });
    const createRun = vi.fn(async () => ({ id: "r2" }));
    const schedule = vi.fn();
    const res = await createRunResponse({
      getAdmin: unauthorized as never,
      repo: { createRun } as never,
      schedule,
    });
    expect(res.status).toBe(401);
    expect(createRun).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it("403s a forbidden caller on getRun and does not touch the repo", async () => {
    const forbidden = vi.fn(async () => { throw new ForbiddenError(); });
    const getRun = vi.fn(async () => run);
    const res = await getRunResponse("r1", { getAdmin: forbidden as never, repo: { getRun } as never });
    expect(res.status).toBe(403);
    expect(getRun).not.toHaveBeenCalled();
  });
});

describe("createRunResponse", () => {
  it("snapshots settings, creates a pending run, and schedules the job WITHOUT awaiting it", async () => {
    const createRun = vi.fn(async () => ({ id: "r1" }));
    const getSettings = vi.fn(async () => settings);
    const runEval = vi.fn(async () => {});
    let captured: (() => void | Promise<void>) | null = null;
    const schedule = vi.fn((fn: () => void | Promise<void>) => {
      captured = fn;
    });

    const res = await createRunResponse({
      getAdmin: admin as never,
      repo: { createRun } as never,
      getSettings: getSettings as never,
      runEval: runEval as never,
      schedule,
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "r1", status: "pending" });
    expect(createRun).toHaveBeenCalledWith(settings);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(captured).toBeTypeOf("function");
    // The job must not have run (let alone been awaited) synchronously during the request.
    expect(runEval).not.toHaveBeenCalled();

    // Invoking the captured thunk separately proves it's wired to runEvaluation correctly.
    await captured!();
    expect(runEval).toHaveBeenCalledWith("r1", settings);
  });
});

describe("listRunsResponse", () => {
  it("returns the runs", async () => {
    const listRuns = vi.fn(async () => [run]);
    const res = await listRunsResponse({ getAdmin: admin as never, repo: { listRuns } as never });
    expect(res.status).toBe(200);
    expect((await res.json()).runs).toHaveLength(1);
  });
});

describe("getRunResponse", () => {
  it("returns the run and its results", async () => {
    const getRun = vi.fn(async () => run);
    const getResults = vi.fn(async () => [{ id: "res1" }]);
    const res = await getRunResponse("r1", { getAdmin: admin as never, repo: { getRun, getResults } as never });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.run).toBeTruthy();
    expect(body.results).toHaveLength(1);
    expect(getResults).toHaveBeenCalledWith("r1");
  });

  it("404s when the run does not exist and does not fetch results", async () => {
    const getRun = vi.fn(async () => null);
    const getResults = vi.fn(async () => []);
    const res = await getRunResponse("nope", { getAdmin: admin as never, repo: { getRun, getResults } as never });
    expect(res.status).toBe(404);
    expect(getResults).not.toHaveBeenCalled();
  });
});
