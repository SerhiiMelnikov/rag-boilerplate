"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Trash2, RefreshCw } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface DocRow {
  id: string;
  filename: string;
  status: string;
  error?: string | null;
  createdAt: string;
}

// How often to refresh the list while a document is still being processed.
const POLL_INTERVAL_MS = 2500;

export function DocumentsManager() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DocRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/documents");
    if (res.ok) setDocs((await res.json()).documents);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Ingestion runs in the background, so poll until every document has settled
  // to "ready" or "error". The interval is torn down once nothing is processing.
  const hasProcessing = docs.some((d) => d.status === "processing" || d.status === "pending");
  useEffect(() => {
    if (!hasProcessing) return;
    const t = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [hasProcessing, load]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      // Returns immediately with status "processing"; polling picks up the rest.
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
          ref={fileInputRef}
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
              <td>
                <StatusBadge status={d.status} error={d.error} />
              </td>
              <td className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {d.status === "error" && (
                    <button
                      type="button"
                      aria-label={`Retry ${d.filename}`}
                      title="Re-upload this file to retry"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-zinc-400 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Delete ${d.filename}`}
                    onClick={() => setPendingDelete(d)}
                    className="text-zinc-400 transition-colors hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
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

function StatusBadge({ status, error }: { status: string; error?: string | null }) {
  if (status === "processing" || status === "pending") {
    return (
      <span className="flex items-center gap-1.5 text-zinc-500">
        <Spinner label="Processing" /> {status}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="text-red-600" title={error ?? undefined}>
        error
      </span>
    );
  }
  return <span className="text-green-600 dark:text-green-500">ready</span>;
}
