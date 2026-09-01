"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Loading } from "@/components/ui/loading";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

// The reconcile plan the preview endpoint returns; the same shape planSync builds
// server-side (see @/lib/documents/sync). Paths are already sorted.
interface SyncPlan {
  add: string[];
  update: string[];
  delete: string[];
  dirs: string[];
  errors: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  // Called after a successful apply so the caller can refresh its file list.
  onApplied?: () => void;
}

function docCountLabel(n: number): string {
  return `${n} ${n === 1 ? "document" : "documents"}`;
}

// One reconcile pass against the configured documents directories: preview what
// would be added, re-ingested and deleted, then apply exactly that previewed plan.
// A delete is irreversible, so when the plan removes anything the admin must tick a
// confirmation before Apply unlocks.
export function SyncDialog({ open, onClose, onApplied }: Props) {
  const [plan, setPlan] = useState<SyncPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmedDelete, setConfirmedDelete] = useState(false);
  const [applying, setApplying] = useState(false);

  const preview = useCallback(async () => {
    setPlan(null);
    setError(null);
    setConfirmedDelete(false);
    try {
      const res = await fetch("/api/admin/documents/sync/preview", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        // 409 when no directories are configured; the body carries the reason.
        setError(typeof data?.error === "string" ? data.error : "Could not preview the sync.");
        return;
      }
      setPlan(data as SyncPlan);
    } catch {
      setError("Could not preview the sync.");
    }
  }, []);

  // Re-preview each time the dialog opens: the directory contents (and the plan)
  // may have changed since the admin last looked.
  useEffect(() => {
    if (open) void preview();
  }, [open, preview]);

  async function apply() {
    if (!plan) return;
    setApplying(true);
    try {
      const res = await fetch("/api/admin/documents/sync/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ add: plan.add, update: plan.update, delete: plan.delete }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(typeof data?.error === "string" ? data.error : "Could not apply the sync.");
        return;
      }
      onApplied?.();
      onClose();
    } finally {
      setApplying(false);
    }
  }

  const hasDeletes = (plan?.delete.length ?? 0) > 0;
  const applyDisabled = !plan || applying || (hasDeletes && !confirmedDelete);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Sync from directory"
      description="Reconcile the knowledge base with the configured documents directories."
      size="lg"
    >
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}

      {plan && plan.errors.length > 0 && (
        <Alert tone="danger" className="mb-3">
          {plan.errors.map((e, i) => (
            <span key={i} className="block">{e}</span>
          ))}
        </Alert>
      )}

      {!plan && !error ? (
        <Loading inline />
      ) : plan ? (
        <>
          {plan.add.length === 0 && plan.update.length === 0 && plan.delete.length === 0 ? (
            <p className="text-sm text-ink-muted">Everything is already in sync — no changes to apply.</p>
          ) : (
            <div className="space-y-4">
              <PlanSection title="Add" paths={plan.add} />
              <PlanSection title="Update" paths={plan.update} />
              <PlanSection title="Delete" paths={plan.delete} tone="danger" />
            </div>
          )}

          {hasDeletes && (
            <label className="mt-4 flex items-start gap-2 text-sm text-danger">
              <input
                type="checkbox"
                checked={confirmedDelete}
                onChange={(e) => setConfirmedDelete(e.target.checked)}
                className={cn("mt-0.5", FOCUS_RING)}
              />
              <span>I understand {docCountLabel(plan.delete.length)} will be deleted</span>
            </label>
          )}

          <div className="mt-5 flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={applying}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void apply()} disabled={applyDisabled} loading={applying}>
              Apply
            </Button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}

function PlanSection({ title, paths, tone }: { title: string; paths: string[]; tone?: "danger" }) {
  return (
    <div>
      <p className={cn("mb-1 text-sm font-medium", tone === "danger" ? "text-danger" : "text-ink")}>
        {title} <span className="text-ink-muted">({paths.length})</span>
      </p>
      {paths.length === 0 ? (
        <p className="text-xs text-ink-muted">Nothing.</p>
      ) : (
        <ul className={cn("space-y-0.5 text-xs", tone === "danger" ? "text-danger" : "text-ink-muted")}>
          {paths.map((p) => (
            <li key={p} className="truncate font-mono" title={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
