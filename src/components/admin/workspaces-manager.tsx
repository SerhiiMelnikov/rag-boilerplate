"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2, Plus, Save, Users, Pencil, FolderOpen } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Loading } from "@/components/ui/loading";
import { Pagination, paginate, PAGE_SIZES, DEFAULT_PAGE_SIZE } from "@/components/ui/pagination";
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

export type EditIntent =
  | { kind: "commit"; name: string | null; description: string | null }
  | { kind: "abandon" };

// The whole commit-or-abandon rule, as a pure function.
//
// It lives out here because the component's guard has to survive an unmount, and
// jsdom NEVER fires `blur` when a focused element is removed from the DOM — it
// moves activeElement to <body> and react-dom never calls .blur(). A test written
// against the wiring therefore passes with or without the guard, which is exactly
// how two bugs hid on the 6B branch. Test this exhaustively; the wiring gets a
// smoke test and nothing more.
//
// `name: null` means "do not send a name at all" — the default workspace's name
// is immutable and the API rejects an attempt to change it.
export function editIntent(
  draft: { name: string; description: string },
  current: { name: string; description: string | null },
  opts: { cancelled: boolean; nameLocked: boolean },
): EditIntent {
  if (opts.cancelled) return { kind: "abandon" };

  const name = draft.name.trim();
  const description = draft.description.trim() || null;
  const currentDescription = (current.description ?? "").trim() || null;

  if (!opts.nameLocked && name === "") return { kind: "abandon" };

  const nameChanged = !opts.nameLocked && name !== current.name;
  const descriptionChanged = description !== currentDescription;
  if (!nameChanged && !descriptionChanged) return { kind: "abandon" };

  return { kind: "commit", name: opts.nameLocked ? null : name, description };
}

export function WorkspacesManager() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [draft, setDraft] = useState<Record<string, { name: string; description: string }>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [accessFor, setAccessFor] = useState<Row | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  // One commit per edit, whichever path (Save, Enter, or the blur that follows
  // Escape/unmount in a real browser) gets there first. A ref, not state: a blur
  // handler closes over the render it was attached in, so state would hand it a
  // stale copy. jsdom never fires that blur at all (see editIntent's comment
  // above), which is exactly why this can only be exercised by hand, not by test.
  const settled = useRef(false);
  // Escape is a distinct signal from "lost focus", set before the unmount that
  // follows it. Also a ref for the same reason: it has to be read from inside a
  // blur handler attached during a now-stale render.
  const cancelled = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/workspaces");
    if (res.ok) {
      const list: Row[] = (await res.json()).workspaces;
      setRows(list);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function startEdit(w: Row) {
    settled.current = false;
    cancelled.current = false;
    setDraft((p) => ({ ...p, [w.id]: { name: w.name, description: w.description ?? "" } }));
    setEditingId(w.id);
  }

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

  async function commit(w: Row) {
    if (settled.current) return;
    settled.current = true;
    const intent = editIntent(
      draft[w.id] ?? { name: w.name, description: w.description ?? "" },
      { name: w.name, description: w.description },
      { cancelled: cancelled.current, nameLocked: w.isDefault },
    );
    setEditingId(null);
    if (intent.kind === "abandon") return;
    // intent.name === null means the name is locked (the default workspace) — omit
    // it from the body entirely rather than send the unchanged value back.
    const body = intent.name === null ? { description: intent.description } : { name: intent.name, description: intent.description };
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/workspaces/${w.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "Could not save the workspace.");
        // Reopen the row with the draft the admin typed still in it — without this,
        // the row above went read-only the moment Save was pressed, and startEdit()
        // would re-seed the input from the stored (unchanged) value on the next
        // click, silently discarding what they typed.
        settled.current = false;
        setEditingId(w.id);
        return;
      }
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

  const header = (
    <PageHeader
      className="mx-auto w-full max-w-6xl"
      title="Workspaces"
      description="Groups of files. Each conversation asks questions of exactly one workspace."
    />
  );

  const paged = paginate(rows ?? [], page, pageSize);

  // The frame first, the data into it — same note as users-manager.
  if (!rows) {
    return (
      <>
        {header}
        <PageBody className="mx-auto w-full max-w-6xl"><Loading label="Loading workspaces" /></PageBody>
      </>
    );
  }

  return (
    <>
      {header}
      <PageBody className="mx-auto w-full max-w-6xl space-y-4">
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

        {rows.length === 0 ? (
          // The default workspace always exists (it is seeded at install), so an
          // empty list here means the fetch returned nothing, not "no matches" —
          // there is no filter on this screen to have produced that instead.
          <EmptyState
            icon={FolderOpen}
            title="No workspaces"
            description="Every install has a default workspace. If this list is empty, the seed step has not run."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Description</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {paged.rows.map((w) => {
                const isEditing = editingId === w.id;
                const d = draft[w.id] ?? { name: w.name, description: w.description ?? "" };
                // Escape sets cancelled.current before unmounting the input; Enter and
                // blur both call commit() directly. settled/cancelled decide what
                // actually happens — see their declarations and editIntent above.
                const onFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commit(w);
                  } else if (e.key === "Escape") {
                    cancelled.current = true;
                    setEditingId(null);
                  }
                };
                return (
                  <TR
                    key={w.id}
                    // Only the row currently being edited gets this handler. Every row's
                    // Edit/Access/Delete buttons are focusable regardless of edit state,
                    // so an unconditional handler would also fire while tabbing out of a
                    // row that isn't being edited (e.g. tabbing from this row's own
                    // buttons into the next row while a different row is mid-edit) and
                    // call commit() for the wrong row — poisoning the shared `settled`
                    // ref for the edit that is actually in progress.
                    onBlur={
                      isEditing
                        ? (e) => {
                            // React's onBlur maps to the native focusout, which bubbles,
                            // so one handler on the row sees focus leaving either field.
                            // relatedTarget is where focus went: still inside this row
                            // means the admin is moving from the name to the description,
                            // which is not the end of the edit. A null relatedTarget —
                            // clicking dead space, or the row unmounting — still commits:
                            // contains(null) is false.
                            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                            void commit(w);
                          }
                        : undefined
                    }
                  >
                    <TD>
                      {w.isDefault ? (
                        <span className="flex items-center gap-2 font-medium">
                          {w.name}
                          <Badge>default</Badge>
                        </span>
                      ) : isEditing ? (
                        <input
                          aria-label={`Name of ${w.name}`}
                          autoFocus
                          value={d.name}
                          onChange={(e) => setDraft((p) => ({ ...p, [w.id]: { ...d, name: e.target.value } }))}
                          onKeyDown={onFieldKeyDown}
                          className={cn(inputClass, "w-full", FOCUS_RING)}
                        />
                      ) : (
                        <span>{w.name}</span>
                      )}
                    </TD>
                    <TD>
                      {isEditing ? (
                        <input
                          aria-label={`Description of ${w.name}`}
                          placeholder="Description"
                          // The default workspace has no name input (its name is immutable —
                          // see the span above), so this is the only field in its row. Without
                          // this, opening it focuses nothing: the Edit button that had focus
                          // just unmounted, and a keyboard user is dropped to <body>.
                          autoFocus={w.isDefault}
                          value={d.description}
                          onChange={(e) => setDraft((p) => ({ ...p, [w.id]: { ...d, description: e.target.value } }))}
                          onKeyDown={onFieldKeyDown}
                          className={cn(inputClass, "w-full", FOCUS_RING)}
                        />
                      ) : (
                        <span className={cn(!w.description && "text-ink-muted")}>{w.description || "—"}</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isEditing ? (
                          <Button variant="secondary" size="sm" aria-label={`Save ${d.name}`} onClick={() => void commit(w)} disabled={busy}>
                            <Save className="h-4 w-4" /> Save
                          </Button>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Edit ${w.name}`}
                            title="Edit"
                            onClick={() => startEdit(w)}
                            className={cn("text-ink-subtle transition-colors hover:text-ink", FOCUS_RING)}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        <Button variant="secondary" size="sm" aria-label={`Manage access to ${w.name}`} onClick={() => setAccessFor(w)}>
                          <Users className="h-4 w-4" /> Access
                        </Button>
                        {!w.isDefault && (
                          <button
                            type="button"
                            aria-label={`Delete ${w.name}`}
                            title="Delete"
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
        )}
        {rows.length > PAGE_SIZES[0] && (
          <Pagination
            total={rows.length}
            page={paged.page}
            pageCount={paged.pageCount}
            from={paged.from}
            to={paged.to}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={setPageSize}
            noun="workspaces"
          />
        )}
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
