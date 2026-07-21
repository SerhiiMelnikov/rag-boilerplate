import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { getRuntimeSettings } from "@/lib/config/settings-service";
import { evalRepo, type EvalRepo } from "@/lib/eval/repo";
import { runEvaluation } from "@/lib/eval/run";
import type { EvalSettingsSnapshot } from "@/lib/eval/types";

export interface RunsDeps {
  getAdmin?: typeof requireAdmin;
  repo?: EvalRepo;
  getSettings?: typeof getRuntimeSettings;
  runEval?: typeof runEvaluation;
  schedule?: (fn: () => void | Promise<void>) => void;
}

// Project the specific RuntimeSettings fields that affect retrieval/generation into
// a persisted snapshot, so a run's results stay attributable to the exact settings
// used even if the admin changes settings again before the run finishes.
function snapshot(s: Awaited<ReturnType<typeof getRuntimeSettings>>): EvalSettingsSnapshot {
  return {
    topK: s.topK,
    minSimilarity: s.minSimilarity,
    contextTokenBudget: s.contextTokenBudget,
    chatProvider: s.chatProvider,
    chatModel: s.chatModel,
    embeddingProvider: s.embeddingProvider,
    embeddingModel: s.embeddingModel,
    temperature: s.temperature,
    systemPrompt: s.systemPrompt,
  };
}

export async function createRunResponse(request: Request, deps: RunsDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const repo = deps.repo ?? evalRepo;
  const getSettings = deps.getSettings ?? getRuntimeSettings;
  const runEval = deps.runEval ?? runEvaluation;
  const schedule =
    deps.schedule ??
    ((fn: () => void | Promise<void>) => {
      void Promise.resolve()
        .then(fn)
        .catch((e) => console.error("background job failed", e));
    });
  try {
    await getAdmin(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const settings = await getSettings();
  const { id } = await repo.createRun(snapshot(settings));
  // Schedule the (potentially long-running) evaluation job in the background;
  // the request returns immediately with the run left in "pending" status.
  schedule(() => runEval(id, settings));
  return Response.json({ id, status: "pending" }, { status: 201 });
}

export async function listRunsResponse(request: Request, deps: RunsDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const repo = deps.repo ?? evalRepo;
  try {
    await getAdmin(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  return Response.json({ runs: await repo.listRuns() });
}

export async function getRunResponse(id: string, request: Request, deps: RunsDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const repo = deps.repo ?? evalRepo;
  try {
    await getAdmin(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const run = await repo.getRun(id);
  if (!run) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ run, results: await repo.getResults(id) });
}
