"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, Plus, Save, Pencil } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MultiSelect } from "@/components/ui/multi-select";

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

const inputClass = "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700";
const buttonClass = "inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-sm transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

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

  if (!rows) return <div className="p-6 text-zinc-500">Loading...</div>;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-xl font-semibold">Evaluation</h1>
      <p className="mb-4 text-sm text-zinc-500">Golden questions used to measure retrieval and answer quality.</p>

      {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="mb-5 flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <textarea
          aria-label="Question"
          placeholder="Question"
          value={form.question}
          onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
          className={`${inputClass} min-h-16`}
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
          className={`${inputClass} min-h-12`}
        />
        <div className="flex items-center gap-2">
          <button type="button" onClick={save} disabled={busy || !form.question.trim()} className={buttonClass}>
            {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editingId ? "Save changes" : "Add question"}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className={buttonClass}>Cancel</button>
          )}
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((q) => (
          <li key={q.id} className="flex flex-col gap-1 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{q.question}</span>
              <span className="flex shrink-0 gap-2">
                <button type="button" aria-label={`Edit ${q.question}`} onClick={() => startEdit(q)} className={buttonClass}>
                  <Pencil className="h-4 w-4" /> Edit
                </button>
                <button type="button" aria-label={`Delete ${q.question}`} onClick={() => setPendingDelete(q)} className="text-zinc-400 transition-colors hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </div>
            {q.expectedDocumentIds.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {q.expectedDocumentIds.map((id) => (
                  <span key={id} className="rounded bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">{filenameFor(id)}</span>
                ))}
              </div>
            )}
            {q.referenceAnswer && <p className="text-xs text-zinc-500">{q.referenceAnswer}</p>}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete question?"
        description={pendingDelete ? `"${pendingDelete.question}" will be permanently removed.` : undefined}
        confirmLabel="Delete"
        pending={busy}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
