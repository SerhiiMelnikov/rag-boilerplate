"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, Plus, Save } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Row {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
}

const inputClass = "rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700";
const buttonClass = "inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-sm transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

export function WorkspacesManager() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [draft, setDraft] = useState<Record<string, { name: string; description: string }>>({});
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/workspaces");
    if (res.ok) {
      const list: Row[] = (await res.json()).workspaces;
      setRows(list);
      setDraft(Object.fromEntries(list.map((w) => [w.id, { name: w.name, description: w.description ?? "" }])));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // An empty description is omitted rather than sent as "".
      const description = newDescription.trim();
      const res = await fetch("/api/admin/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(description ? { name: newName.trim(), description } : { name: newName.trim() }),
      });
      if (!res.ok) { setError((await res.json()).error ?? "Could not create the workspace."); return; }
      setNewName("");
      setNewDescription("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function save(w: Row) {
    const d = draft[w.id];
    if (!d) return;
    setBusy(true);
    setError(null);
    try {
      // The default workspace's name is immutable — send only its description.
      // An emptied description clears the column (null), never stores "".
      const description = d.description.trim() || null;
      const body = w.isDefault ? { description } : { name: d.name.trim(), description };
      const res = await fetch(`/api/admin/workspaces/${w.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { setError((await res.json()).error ?? "Could not save the workspace."); return; }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/workspaces/${pendingDelete.id}`, { method: "DELETE" });
      if (!res.ok) { setError((await res.json()).error ?? "Could not delete the workspace."); return; }
      await load();
    } finally {
      setBusy(false);
      setPendingDelete(null);
    }
  }

  if (!rows) return <div className="p-6 text-zinc-500">Loading...</div>;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-xl font-semibold">Workspaces</h1>
      <p className="mb-4 text-sm text-zinc-500">Group documents and images. Everyone always has access to the default workspace.</p>

      {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input aria-label="New workspace name" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} className={inputClass} />
        <input aria-label="New workspace description" placeholder="Description (optional)" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className={`${inputClass} flex-1`} />
        <button type="button" onClick={create} disabled={busy || !newName.trim()} className={buttonClass}>
          <Plus className="h-4 w-4" /> Create
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((w) => {
          const d = draft[w.id] ?? { name: w.name, description: "" };
          return (
            <li key={w.id} className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              {w.isDefault ? (
                <span className="flex items-center gap-2 font-medium">
                  {w.name}
                  <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-700">default</span>
                </span>
              ) : (
                <input
                  aria-label={`Name of ${w.name}`}
                  value={d.name}
                  onChange={(e) => setDraft((p) => ({ ...p, [w.id]: { ...d, name: e.target.value } }))}
                  className={inputClass}
                />
              )}
              <input
                aria-label={`Description of ${w.name}`}
                placeholder="Description"
                value={d.description}
                onChange={(e) => setDraft((p) => ({ ...p, [w.id]: { ...d, description: e.target.value } }))}
                className={`${inputClass} flex-1`}
              />
              <button type="button" aria-label={`Save ${d.name}`} onClick={() => save(w)} disabled={busy} className={buttonClass}>
                <Save className="h-4 w-4" /> Save
              </button>
              {!w.isDefault && (
                <button type="button" aria-label={`Delete ${w.name}`} onClick={() => setPendingDelete(w)} className="text-zinc-400 transition-colors hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete workspace?"
        description={pendingDelete ? `"${pendingDelete.name}" will be removed. Its documents and images stay available through the default workspace.` : undefined}
        confirmLabel="Delete"
        pending={busy}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
