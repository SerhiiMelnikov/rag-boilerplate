"use client";

import { useCallback, useEffect, useState } from "react";
import { Upload, Trash2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface DocRow {
  id: string;
  filename: string;
  status: string;
  createdAt: string;
}

export function DocumentsManager() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DocRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/documents");
    if (res.ok) setDocs((await res.json()).documents);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      await fetch("/api/admin/documents", { method: "POST", body: form });
      await load();
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/documents/${pendingDelete.id}`, { method: "DELETE" });
      await load();
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Documents</h1>
      <label className="mb-4 inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
        {busy ? <Spinner label="Uploading" /> : <Upload className="h-4 w-4" />}
        {busy ? "Uploading..." : "Upload document"}
        <input
          type="file"
          accept=".pdf,.docx,.md,.txt,.markdown"
          aria-label="Upload document"
          onChange={upload}
          className="hidden"
          disabled={busy}
        />
      </label>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <th className="py-2">File</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2">{d.filename}</td>
              <td>{d.status}</td>
              <td className="text-right">
                <button
                  type="button"
                  aria-label={`Delete ${d.filename}`}
                  onClick={() => setPendingDelete(d)}
                  className="text-zinc-400 transition-colors hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete document?"
        description={
          pendingDelete
            ? `"${pendingDelete.filename}" and its indexed chunks will be permanently removed.`
            : undefined
        }
        confirmLabel="Delete"
        pending={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
