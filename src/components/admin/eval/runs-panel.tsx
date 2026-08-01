"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Play, ChevronDown, ChevronRight } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/cn";
import type { EvalAggregate, EvalSettingsSnapshot, RetrievedDoc } from "@/lib/eval/types";

interface RunRow {
  id: string;
  status: "pending" | "running" | "done" | "error";
  settingsSnapshot: EvalSettingsSnapshot;
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

// Same cadence as FilesManager's processing-status poll (src/components/admin/files-manager.tsx).
const POLL_INTERVAL_MS = 2500;

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-2">
      <div className="font-mono text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-ink-muted">{label}</div>
    </div>
  );
}

// Missing/malformed fields (e.g. an older or hand-edited snapshot) fall back to
// an em dash rather than rendering "undefined" or crashing.
function fmtNum(n: number | undefined | null): string {
  return typeof n === "number" ? String(n) : "—";
}

function fmtModel(provider: string | undefined | null, model: string | undefined | null): string {
  if (!model) return "—";
  return provider ? `${provider}/${model}` : model;
}

// Compact readout of the settings that produced a run, so an admin can compare
// runs before/after tuning without cross-referencing the Settings page. The
// systemPrompt is intentionally omitted here — it can be long and isn't one of
// the knobs an admin scans across runs.
function SettingsSnapshotSummary({ snapshot }: { snapshot: EvalSettingsSnapshot | null | undefined }) {
  if (!snapshot) return null;
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile label="Top-K" value={fmtNum(snapshot.topK)} />
      <Tile label="Min similarity" value={fmtNum(snapshot.minSimilarity)} />
      <Tile label="Chat model" value={fmtModel(snapshot.chatProvider, snapshot.chatModel)} />
      <Tile label="Temperature" value={fmtNum(snapshot.temperature)} />
    </div>
  );
}

function RunStatusBadge({ status, error }: { status: RunRow["status"]; error?: string | null }) {
  if (status === "pending" || status === "running") {
    return (
      <Badge tone="warning">
        <Spinner label={status} className="h-3 w-3" /> {status}
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <span title={error ?? undefined}>
        <Badge tone="danger">error</Badge>
      </span>
    );
  }
  return <Badge tone="success">done</Badge>;
}

export function RunsPanel() {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [openResultId, setOpenResultId] = useState<string | null>(null);

  // The selection as of *now*, readable from inside the poll interval and from a
  // response handler — `selectedId` alone would be a stale closure in both.
  const selectedIdRef = useRef<string | null>(null);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/evaluation/runs/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    // A slow response for a run the admin has already navigated away from must not
    // overwrite the detail now on screen.
    if (selectedIdRef.current !== id) return;
    setDetail(data);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/evaluation/runs");
    if (res.ok) setRuns((await res.json()).runs);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Poll while any run is still pending/running; stop (and clear the timer) once
  // none are in-flight — mirrors FilesManager's hasProcessing poll.
  const hasInFlight = (runs ?? []).some((r) => r.status === "pending" || r.status === "running");
  const selectedInFlight = (runs ?? []).some(
    (r) => r.id === selectedId && (r.status === "pending" || r.status === "running"),
  );
  useEffect(() => {
    if (!hasInFlight) return;
    const t = setInterval(() => {
      void load();
      // Refresh the open detail on the same tick, so a run watched while it executes
      // fills in live. `loadDetail` leaves `detail` and `openResultId` alone, so this
      // neither flickers nor collapses the row being read. The tick that observes the
      // terminal status still fires this, which is how the finished state lands
      // before the interval clears.
      if (selectedInFlight && selectedIdRef.current) void loadDetail(selectedIdRef.current);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [hasInFlight, selectedInFlight, load, loadDetail]);

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
    selectedIdRef.current = id;
    setSelectedId(id);
    setDetail(null);
    setOpenResultId(null);
    await loadDetail(id);
  }

  if (!runs) return <div className="p-6 text-ink-muted">Loading...</div>;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Card
        title="Evaluation runs"
        description="Trigger a run against the current settings and golden questions."
        actions={
          <Button variant="secondary" onClick={triggerRun} disabled={busy}>
            <Play className="h-4 w-4" /> Run evaluation
          </Button>
        }
      >
        {error && <Alert tone="danger" className="mb-3">{error}</Alert>}

        {runs.length === 0 && <p className="text-sm text-ink-muted">No runs yet.</p>}

        <ul className="mb-6 flex flex-col gap-2">
          {runs.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => selectRun(r.id)}
                className={cn(
                  "w-full rounded border p-3 text-left text-sm transition-colors hover:bg-surface-2",
                  selectedId === r.id ? "border-border-strong" : "border-border",
                  FOCUS_RING,
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">{new Date(r.createdAt).toLocaleString()}</span>
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
          <div className="rounded border border-border p-3">
            <h3 className="mb-2 text-sm font-medium">Run detail</h3>
            {!detail ? (
              <p className="text-sm text-ink-muted">Loading...</p>
            ) : (
              <>
                <SettingsSnapshotSummary snapshot={detail.run.settingsSnapshot} />
                {detail.results.length === 0 ? (
                  <p className="text-sm text-ink-muted">No results yet.</p>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Question</TH>
                        <TH>Hit</TH>
                        <TH numeric>Recall</TH>
                        <TH numeric>Precision</TH>
                        <TH numeric>MRR</TH>
                        <TH numeric>Judge</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {detail.results.map((res) => {
                        const isOpen = openResultId === res.id;
                        return (
                          <Fragment key={res.id}>
                            <TR>
                              <TD>
                                <button
                                  type="button"
                                  onClick={() => setOpenResultId(isOpen ? null : res.id)}
                                  className={cn("flex items-center gap-1 text-left", FOCUS_RING)}
                                >
                                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                                  {res.questionText}
                                </button>
                              </TD>
                              <TD>{res.hit ? "✓" : "✗"}</TD>
                              <TD numeric>{pct(res.recall)}</TD>
                              <TD numeric>{pct(res.precision)}</TD>
                              <TD numeric>{pct(res.mrr)}</TD>
                              <TD numeric>
                                {res.judgeScore === null ? "—" : `${res.judgeScore}/5`}
                                {/* Rationale stays visible without expanding the disclosure so an
                                    admin can scan why a question scored low at a glance. Reset
                                    back to the prose face here: this TD's numeric styling
                                    (right-aligned, mono, tabular figures) would otherwise be
                                    inherited by this sentence too. */}
                                {res.judgeRationale && (
                                  <div className="mt-0.5 text-left font-sans text-xs font-normal normal-nums text-ink-subtle">
                                    {res.judgeRationale}
                                  </div>
                                )}
                              </TD>
                            </TR>
                            {isOpen && (
                              <TR>
                                <TD colSpan={6} className="text-xs text-ink-muted">
                                  {res.generatedAnswer && <p><span className="font-medium">Answer: </span>{res.generatedAnswer}</p>}
                                  {res.retrieved.length > 0 && (
                                    <p className="mt-1">Sources: {res.retrieved.map((d) => d.filename).join(", ")}</p>
                                  )}
                                  {res.error && <p className="mt-1 text-danger">{res.error}</p>}
                                </TD>
                              </TR>
                            )}
                          </Fragment>
                        );
                      })}
                    </TBody>
                  </Table>
                )}
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
