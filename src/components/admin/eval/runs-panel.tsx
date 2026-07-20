"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Play, ChevronDown, ChevronRight } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { EvalAggregate, RetrievedDoc } from "@/lib/eval/types";

interface RunRow {
  id: string;
  status: "pending" | "running" | "done" | "error";
  aggregate: EvalAggregate | null;
  error: string | null;
  createdAt: string;
}

interface ResultRow {
  id: string;
  questionId: string | null;
  questionText: string;
  retrieved: RetrievedDoc[];
  hit: boolean;
  recall: number;
  precision: number;
  mrr: number;
  judgeScore: number | null;
  judgeRationale: string | null;
  generatedAnswer: string | null;
  error: string | null;
}

interface RunDetail {
  run: RunRow;
  results: ResultRow[];
}

const buttonClass = "inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-sm transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

// Same cadence as FilesManager's processing-status poll (src/components/admin/files-manager.tsx).
const POLL_INTERVAL_MS = 2500;

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function RunStatusBadge({ status, error }: { status: RunRow["status"]; error?: string | null }) {
  if (status === "pending" || status === "running") {
    return <span className="flex items-center gap-1.5 text-zinc-500"><Spinner label={status} /> {status}</span>;
  }
  if (status === "error") return <span className="text-red-600" title={error ?? undefined}>error</span>;
  return <span className="text-green-600 dark:text-green-500">done</span>;
}

export function RunsPanel() {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [openResultId, setOpenResultId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/evaluation/runs");
    if (res.ok) setRuns((await res.json()).runs);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Poll while any run is still pending/running; stop (and clear the timer) once
  // none are in-flight — mirrors FilesManager's hasProcessing poll.
  const hasInFlight = (runs ?? []).some((r) => r.status === "pending" || r.status === "running");
  useEffect(() => {
    if (!hasInFlight) return;
    const t = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [hasInFlight, load]);

  async function triggerRun() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/evaluation/runs", { method: "POST" });
      if (!res.ok) { setError((await res.json()).error ?? "Could not start the run."); return; }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function selectRun(id: string) {
    setSelectedId(id);
    setDetail(null);
    setOpenResultId(null);
    const res = await fetch(`/api/admin/evaluation/runs/${id}`);
    if (res.ok) setDetail(await res.json());
  }

  if (!runs) return <div className="p-6 text-zinc-500">Loading...</div>;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Evaluation runs</h2>
        <button type="button" onClick={triggerRun} disabled={busy} className={buttonClass}>
          <Play className="h-4 w-4" /> Run evaluation
        </button>
      </div>
      <p className="mb-4 text-sm text-zinc-500">Trigger a run against the current settings and golden questions.</p>

      {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}

      {runs.length === 0 && <p className="text-sm text-zinc-500">No runs yet.</p>}

      <ul className="mb-6 flex flex-col gap-2">
        {runs.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => selectRun(r.id)}
              className={`w-full rounded-md border p-3 text-left text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
                selectedId === r.id ? "border-zinc-400 dark:border-zinc-600" : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">{new Date(r.createdAt).toLocaleString()}</span>
                <RunStatusBadge status={r.status} error={r.error} />
              </div>
              {r.aggregate && (
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  <Tile label="Recall" value={pct(r.aggregate.avgRecall)} />
                  <Tile label="Precision" value={pct(r.aggregate.avgPrecision)} />
                  <Tile label="MRR" value={pct(r.aggregate.avgMrr)} />
                  <Tile label="Judge" value={`${r.aggregate.avgJudgeScore.toFixed(1)}/5`} />
                  <Tile label="Pass rate" value={pct(r.aggregate.passRate)} />
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>

      {selectedId && (
        <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <h3 className="mb-2 text-sm font-medium">Run detail</h3>
          {!detail ? (
            <p className="text-sm text-zinc-500">Loading...</p>
          ) : detail.results.length === 0 ? (
            <p className="text-sm text-zinc-500">No results yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr>
                  <th className="py-1">Question</th>
                  <th>Hit</th>
                  <th>Recall</th>
                  <th>Precision</th>
                  <th>MRR</th>
                  <th>Judge</th>
                </tr>
              </thead>
              <tbody>
                {detail.results.map((res) => {
                  const isOpen = openResultId === res.id;
                  return (
                    <Fragment key={res.id}>
                      <tr className="border-t border-zinc-200 dark:border-zinc-800">
                        <td className="py-1">
                          <button
                            type="button"
                            onClick={() => setOpenResultId(isOpen ? null : res.id)}
                            className="flex items-center gap-1 text-left"
                          >
                            {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                            {res.questionText}
                          </button>
                        </td>
                        <td>{res.hit ? "✓" : "✗"}</td>
                        <td>{pct(res.recall)}</td>
                        <td>{pct(res.precision)}</td>
                        <td>{pct(res.mrr)}</td>
                        <td>
                          {res.judgeScore === null ? "—" : `${res.judgeScore}/5`}
                          {/* Rationale stays visible without expanding the disclosure so an
                              admin can scan why a question scored low at a glance. */}
                          {res.judgeRationale && (
                            <div className="mt-0.5 text-xs font-normal text-zinc-500">{res.judgeRationale}</div>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-zinc-100 dark:border-zinc-900">
                          <td colSpan={6} className="pb-2 text-xs text-zinc-500">
                            {res.generatedAnswer && <p><span className="font-medium">Answer: </span>{res.generatedAnswer}</p>}
                            {res.retrieved.length > 0 && (
                              <p className="mt-1">Sources: {res.retrieved.map((d) => d.filename).join(", ")}</p>
                            )}
                            {res.error && <p className="mt-1 text-red-600">{res.error}</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
