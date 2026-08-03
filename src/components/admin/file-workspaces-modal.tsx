"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Loading } from "@/components/ui/loading";
import { MultiSelect } from "@/components/ui/multi-select";
import { cn } from "@/lib/cn";
import { X } from "lucide-react";

interface Workspace { id: string; name: string; isDefault: boolean }
interface Props {
  file: { id: string; kind: "document" | "image"; filename: string; workspaces: Workspace[] };
  onClose: () => void;
  onSaved: () => void;
}

export function FileWorkspacesModal({ file, onClose, onSaved }: Props) {
  const [all, setAll] = useState<Workspace[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set(file.workspaces.map((w) => w.id)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/workspaces");
    if (!res.ok) return;
    const list: Workspace[] = (await res.json()).workspaces;
    // General first, then alphabetical — the server already orders this way.
    setAll(list);
  }, []);
  useEffect(() => { void load(); }, [load]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Preserve the server's ordering so the request is deterministic.
      const workspaceIds = (all ?? []).filter((w) => checked.has(w.id)).map((w) => w.id);
      const res = await fetch(`/api/admin/files/${file.kind}/${file.id}/workspaces`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceIds }),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "Could not save the workspaces.");
        await load(); // a workspace may have been deleted in another tab
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const selected = (all ?? []).filter((w) => checked.has(w.id));

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Workspaces for ${file.filename}`}
      description="A file with no workspaces stays in this list but is never used to answer questions."
      size="lg"
    >
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}

      {!all ? (
        <Loading inline label="Loading workspaces" />
      ) : (
        <div className="flex flex-col gap-3">
          {/* A searchable picker rather than a checkbox per workspace: the list grows
              with the install, and a column of small targets is a poor way to add two
              things and remove one. What is chosen shows below as removable chips, so
              the current state is readable without scanning for ticks. */}
          <MultiSelect
            ariaLabel="Add to workspace"
            placeholder="Search workspaces"
            value={[...checked]}
            onChange={(ids) => setChecked(new Set(ids))}
            options={(all ?? []).map((w) => ({
              value: w.id,
              label: w.name,
              hint: w.isDefault ? "everyone" : undefined,
            }))}
          />

          {selected.length === 0 ? (
            <p className="text-sm text-ink-muted">
              In no workspace. It stays in the file list, and no question will ever reach it.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {selected.map((w) => (
                <li key={w.id}>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pl-2.5 pr-1 text-sm text-ink">
                    {w.name}
                    <button
                      type="button"
                      aria-label={`Remove from ${w.name}`}
                      title="Remove"
                      onClick={() => toggle(w.id)}
                      className={cn("rounded-full p-0.5 text-ink-subtle transition-colors hover:text-danger", FOCUS_RING)}
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="button" onClick={save} loading={saving} disabled={!all}>Save</Button>
      </div>
    </Dialog>
  );
}
