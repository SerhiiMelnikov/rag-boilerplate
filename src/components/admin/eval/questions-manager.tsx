"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, Plus, Save, Pencil } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MultiSelect } from "@/components/ui/multi-select";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/cn";

interface QuestionRow {
  id: string;
  question: string;
  expectedDocumentIds: string[];
  referenceAnswer: string | null;
  createdAt: string;
}

interface DocumentOption {
  id: string;
  filename: string;
}

// Shape of the shared files list (GET /api/admin/files, the same source
// FilesManager/FileWorkspacesModal use). Only documents are eligible as
// "expected documents" for a golden question — images are filtered out.
interface FileRow {
  id: string;
  kind: "document" | "image";
  filename: string;
}

const inputClass = "w-full rounded border border-border-strong bg-transparent px-2 py-1.5 text-sm";

const emptyForm = { question: "", expectedDocumentIds: [] as string[], referenceAnswer: "" };

export function QuestionsManager() {
  const [rows, setRows] = useState<QuestionRow[] | null>(null);
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<QuestionRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/evaluation/questions");
    if (res.ok) setRows((await res.json()).questions);
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/files");
      if (!res.ok) return;
      const files: FileRow[] = (await res.json()).files;
      setDocuments(files.filter((f) => f.kind === "document").map((f) => ({ id: f.id, filename: f.filename })));
    })();
  }, []);

  function startEdit(row: QuestionRow) {
    setEditingId(row.id);
    setForm({ question: row.question, expectedDocumentIds: row.expectedDocumentIds, referenceAnswer: row.referenceAnswer ?? "" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function save() {
    if (!form.question.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // A blank reference answer is omitted rather than sent as whitespace.
      const referenceAnswer = form.referenceAnswer.trim();
      const body = {
        question: form.question.trim(),
        expectedDocumentIds: form.expectedDocumentIds,
        ...(referenceAnswer ? { referenceAnswer } : {}),
      };
      const url = editingId ? `/api/admin/evaluation/questions/${editingId}` : "/api/admin/evaluation/questions";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { setError((await res.json()).error ?? "Could not save the question."); return; }
      cancelEdit();
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
      const res = await fetch(`/api/admin/evaluation/questions/${pendingDelete.id}`, { method: "DELETE" });
      if (!res.ok) { setError((await res.json()).error ?? "Could not delete the question."); return; }
      if (editingId === pendingDelete.id) cancelEdit();
      await load();
    } finally {
      setBusy(false);
      setPendingDelete(null);
    }
  }

  function filenameFor(id: string) {
    return documents.find((d) => d.id === id)?.filename ?? id;
  }

  if (!rows) return <div className="p-6 text-ink-muted">Loading...</div>;

  return (
    <>
      <PageHeader
        title="Evaluation"
        description="Golden questions and the runs scored against them."
      />
      <PageBody className="mx-auto max-w-3xl space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex flex-col gap-2 rounded border border-border p-3">
          <textarea
            aria-label="Question"
            placeholder="Question"
            value={form.question}
            onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
            className={cn(inputClass, "min-h-16", FOCUS_RING)}
          />
          <MultiSelect
            ariaLabel="Expected documents"
            value={form.expectedDocumentIds}
            onChange={(v) => setForm((f) => ({ ...f, expectedDocumentIds: v }))}
            options={documents.map((d) => ({ value: d.id, label: d.filename }))}
          />
          <textarea
            aria-label="Reference answer"
            placeholder="Reference answer (optional)"
            value={form.referenceAnswer}
            onChange={(e) => setForm((f) => ({ ...f, referenceAnswer: e.target.value }))}
            className={cn(inputClass, "min-h-12", FOCUS_RING)}
          />
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={save} disabled={busy || !form.question.trim()}>
              {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingId ? "Save changes" : "Add question"}
            </Button>
            {editingId && (
              <Button variant="secondary" size="sm" onClick={cancelEdit}>Cancel</Button>
            )}
          </div>
        </div>

        <ul className="flex flex-col gap-2">
          {rows.map((q) => (
            <li key={q.id} className="flex flex-col gap-1 rounded border border-border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{q.question}</span>
                <span className="flex shrink-0 gap-2">
                  <Button variant="secondary" size="sm" aria-label={`Edit ${q.question}`} onClick={() => startEdit(q)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <button
                    type="button"
                    aria-label={`Delete ${q.question}`}
                    onClick={() => setPendingDelete(q)}
                    className={cn("text-ink-subtle transition-colors hover:text-danger", FOCUS_RING)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </div>
              {q.expectedDocumentIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {q.expectedDocumentIds.map((id) => (
                    <Badge key={id}>{filenameFor(id)}</Badge>
                  ))}
                </div>
              )}
              {q.referenceAnswer && <p className="text-xs text-ink-muted">{q.referenceAnswer}</p>}
            </li>
          ))}
        </ul>
      </PageBody>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete question?"
        description={pendingDelete ? `"${pendingDelete.question}" will be permanently removed.` : undefined}
        confirmLabel="Delete"
        pending={busy}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
