"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Workspaces for ${file.filename}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="mb-1 text-lg font-semibold">Workspaces for {file.filename}</h2>
        <p className="mb-4 text-sm text-zinc-500">A file with no workspaces stays in this list but is never used to answer questions.</p>

        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}

        {!all ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500"><Spinner label="Loading" /> Loading...</div>
        ) : (
          <ul className="flex flex-col gap-1">
            {all.map((w) => (
              <li key={w.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm">
                <input id={`ws-${w.id}`} type="checkbox" checked={checked.has(w.id)} onChange={() => toggle(w.id)} className="h-4 w-4" />
                {/* The "everyone" hint sits outside the <label> so the checkbox's
                    accessible name stays exactly the workspace name. */}
                <label htmlFor={`ws-${w.id}`} className="flex-1">{w.name}</label>
                {w.isDefault && <span className="text-xs text-zinc-500">everyone</span>}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">Cancel</button>
          <button type="button" onClick={save} disabled={saving || !all} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
