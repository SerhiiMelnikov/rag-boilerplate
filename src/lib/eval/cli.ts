import type { RuntimeSettings } from "@/lib/config/settings-service";
import { evalRepo, type EvalRepo, type ResultRow } from "./repo";
import { runEvaluation } from "./run";
import { buildSettingsSnapshot } from "./snapshot";
import type { EvalAggregate } from "./types";

export interface EvalCliDeps {
  repo?: EvalRepo;
  getSettings: () => Promise<RuntimeSettings>;
  runEval?: typeof runEvaluation;
  out: (line: string) => void;
  err: (line: string) => void;
}

interface ParsedArgs { json: boolean; minJudge: number | null; minRecall: number | null }

const USAGE = "Usage: npm run eval -- [--json] [--min-judge <0-5>] [--min-recall <0-1>]";

// Returns the parsed flags, or a message explaining what was wrong with them.
function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  const parsed: ParsedArgs = { json: false, minJudge: null, minRecall: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") { parsed.json = true; continue; }
    if (arg === "--min-judge" || arg === "--min-recall") {
      const raw = argv[++i];
      const n = Number(raw);
      // A threshold that silently becomes a no-op is worse than no threshold at
      // all: the pipeline goes green while nothing is actually being gated.
      // (Number("   ") is 0, so blank/whitespace-only values must be rejected too.)
      if (raw === undefined || raw.trim() === "" || !Number.isFinite(n)) return { error: `${arg} needs a number, got "${raw ?? ""}". ${USAGE}` };
      const max = arg === "--min-judge" ? 5 : 1;
      if (n < 0 || n > max) return { error: `${arg} must be between 0 and ${max}, got ${n}. ${USAGE}` };
      if (arg === "--min-judge") parsed.minJudge = n; else parsed.minRecall = n;
      continue;
    }
    return { error: `Unknown argument "${arg}". ${USAGE}` };
  }
  return parsed;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function reportLines(aggregate: EvalAggregate | null, results: ResultRow[]): string[] {
  const lines: string[] = [];
  if (aggregate) {
    lines.push("");
    lines.push(`  Recall     ${pct(aggregate.avgRecall)}`);
    lines.push(`  Precision  ${pct(aggregate.avgPrecision)}`);
    lines.push(`  MRR        ${pct(aggregate.avgMrr)}`);
    lines.push(`  Judge      ${aggregate.avgJudgeScore.toFixed(1)}/5`);
    lines.push(`  Pass rate  ${pct(aggregate.passRate)}`);
  }
  lines.push("");
  lines.push("  hit  recall  prec    mrr     judge  question");
  for (const r of results) {
    const judge = r.judgeScore === null ? "  -  " : `${r.judgeScore}/5  `;
    lines.push(
      `  ${r.hit ? "yes" : "no "}  ${pct(r.recall).padEnd(6)}  ${pct(r.precision).padEnd(6)}  ${pct(r.mrr).padEnd(6)}  ${judge}  ${r.questionText}${r.error ? `  [${r.error}]` : ""}`,
    );
  }
  return lines;
}

// Run the golden questions against the current settings, writing the run to the
// same tables the admin panel reads. Returns the process exit code.
export async function runEvalCli(argv: string[], deps: EvalCliDeps): Promise<number> {
  const repo = deps.repo ?? evalRepo;
  const runEval = deps.runEval ?? runEvaluation;

  const args = parseArgs(argv);
  if ("error" in args) { deps.err(args.error); return 1; }

  // Everything past this point talks to the database and to model providers.
  // A blip in either must land CI on a clean exit code + diagnostic, never a
  // rejected promise — an uncaught rejection is a far worse CI experience
  // than a reported failure.
  try {
    const questions = await repo.listQuestions();
    if (questions.length === 0) {
      // An evaluation gate that passes green with zero questions is a trap.
      deps.err("No golden questions defined — add some in the admin panel (or via POST /api/admin/evaluation/questions) before running an evaluation.");
      return 1;
    }

    const settings = await deps.getSettings();
    const { id } = await repo.createRun(buildSettingsSnapshot(settings));
    // Diagnostics go to stderr so --json keeps stdout parseable.
    deps.err(`Running ${questions.length} question(s) as run ${id}...`);
    await runEval(id, settings);

    const run = await repo.getRun(id);
    if (!run) { deps.err(`Run ${id} disappeared while it was executing.`); return 1; }
    if (run.status === "error") { deps.err(`Run failed: ${run.error ?? "unknown error"}`); return 1; }
    const results = await repo.getResults(id);

    if (args.json) {
      deps.out(JSON.stringify({ runId: id, status: run.status, aggregate: run.aggregate, results }, null, 2));
    } else {
      deps.out(`Run ${id} — ${run.status} (${results.length} question(s))`);
      for (const line of reportLines(run.aggregate, results)) deps.out(line);
    }

    const failures: string[] = [];
    const aggregate = run.aggregate;
    if (args.minJudge !== null && (!aggregate || aggregate.avgJudgeScore < args.minJudge)) {
      failures.push(`--min-judge ${args.minJudge}: got ${aggregate ? aggregate.avgJudgeScore.toFixed(2) : "no aggregate"}`);
    }
    if (args.minRecall !== null && (!aggregate || aggregate.avgRecall < args.minRecall)) {
      failures.push(`--min-recall ${args.minRecall}: got ${aggregate ? aggregate.avgRecall.toFixed(2) : "no aggregate"}`);
    }
    if (failures.length) { for (const f of failures) deps.err(`Threshold not met: ${f}`); return 1; }
    return 0;
  } catch (e) {
    // Never let this reach deps.out — a stray line on stdout breaks --json piping.
    const message = e instanceof Error ? e.message : String(e);
    deps.err(`Evaluation run failed unexpectedly: ${message}`);
    return 1;
  }
}
