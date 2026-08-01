"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, Plus, Save, Users } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/cn";
import { WorkspaceAccessModal } from "./workspace-access-modal";

interface Row {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
}

const inputClass = "rounded border border-border-strong bg-transparent px-2 py-1 text-sm";

export function WorkspacesManager() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [draft, setDraft] = useState<Record<string, { name: string; description: string }>>({});
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [accessFor, setAccessFor] = useState<Row | null>(null);

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

  if (!rows) return <div className="p-6 text-ink-muted">Loading...</div>;

  return (
    <>
      <PageHeader
        className="mx-auto max-w-3xl"
        title="Workspaces"
        description="Groups of files. Each conversation asks questions of exactly one workspace."
      />
      <PageBody className="mx-auto max-w-3xl space-y-4">
        {/* Kept verbatim from the pre-redesign page: the header description above
            doesn't mention that the default workspace is always accessible to everyone. */}
        <p className="text-sm text-ink-muted">Group documents and images. Everyone always has access to the default workspace.</p>

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="New workspace name" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} className={cn(inputClass, FOCUS_RING)} />
          <input aria-label="New workspace description" placeholder="Description (optional)" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className={cn(inputClass, "flex-1", FOCUS_RING)} />
          <Button variant="secondary" size="sm" onClick={create} disabled={busy || !newName.trim()}>
            <Plus className="h-4 w-4" /> Create
          </Button>
        </div>

        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Description</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.map((w) => {
              const d = draft[w.id] ?? { name: w.name, description: "" };
              return (
                <TR key={w.id}>
                  <TD>
                    {w.isDefault ? (
                      <span className="flex items-center gap-2 font-medium">
                        {w.name}
                        <Badge>default</Badge>
                      </span>
                    ) : (
                      <input
                        aria-label={`Name of ${w.name}`}
                        value={d.name}
                        onChange={(e) => setDraft((p) => ({ ...p, [w.id]: { ...d, name: e.target.value } }))}
                        className={cn(inputClass, "w-full", FOCUS_RING)}
                      />
                    )}
                  </TD>
                  <TD>
                    <input
                      aria-label={`Description of ${w.name}`}
                      placeholder="Description"
                      value={d.description}
                      onChange={(e) => setDraft((p) => ({ ...p, [w.id]: { ...d, description: e.target.value } }))}
                      className={cn(inputClass, "w-full", FOCUS_RING)}
                    />
                  </TD>
                  <TD className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="secondary" size="sm" aria-label={`Save ${d.name}`} onClick={() => save(w)} disabled={busy}>
                        <Save className="h-4 w-4" /> Save
                      </Button>
                      <Button variant="secondary" size="sm" aria-label={`Manage access to ${w.name}`} onClick={() => setAccessFor(w)}>
                        <Users className="h-4 w-4" /> Access
                      </Button>
                      {!w.isDefault && (
                        <button
                          type="button"
                          aria-label={`Delete ${w.name}`}
                          onClick={() => setPendingDelete(w)}
                          className={cn("text-ink-subtle transition-colors hover:text-danger", FOCUS_RING)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </PageBody>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete workspace?"
        description={pendingDelete ? `"${pendingDelete.name}" will be removed. Its documents and images stay available through the default workspace.` : undefined}
        confirmLabel="Delete"
        pending={busy}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {accessFor && (
        <WorkspaceAccessModal
          workspace={{ id: accessFor.id, name: accessFor.name, isDefault: accessFor.isDefault }}
          onClose={() => setAccessFor(null)}
        />
      )}
    </>
  );
}
