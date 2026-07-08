"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Trash2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface ImageRow {
  id: string;
  filename: string;
  status: string;
  error?: string | null;
  createdAt: string;
}

// How often to refresh the list while an image is still being processed.
const POLL_INTERVAL_MS = 2500;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export function ImagesManager() {
  const [imgs, setImgs] = useState<ImageRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ImageRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/images");
    if (res.ok) setImgs((await res.json()).images);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Ingestion runs in the background, so poll until every image has settled
  // to "ready" or "error". The interval is torn down once nothing is processing.
  const hasProcessing = imgs.some((i) => i.status === "processing" || i.status === "pending");
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
      await fetch("/api/admin/images", { method: "POST", body: form });
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
      await fetch(`/api/admin/images/${pendingDelete.id}`, { method: "DELETE" });
      await load();
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Images</h1>
      <label className="mb-4 inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
        {busy ? <Spinner label="Uploading" /> : <Upload className="h-4 w-4" />}
        {busy ? "Uploading..." : "Upload image"}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          aria-label="Upload image"
          onChange={upload}
          className="hidden"
          disabled={busy}
        />
      </label>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {imgs.map((img) => (
          <div key={img.id} className="flex flex-col gap-1 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
            {img.status === "ready" ? (
              // eslint-disable-next-line @next/next/no-img-element -- served bytes, not a static asset
              <img src={`/api/images/${img.id}`} alt={img.filename} className="h-32 w-full rounded object-cover" />
            ) : (
              <div className="flex h-32 w-full items-center justify-center rounded bg-zinc-100 text-xs text-zinc-500 dark:bg-zinc-800">
                <ImageStatus status={img.status} error={img.error} />
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs" title={img.filename}>
                {img.filename}
              </span>
              <button
                type="button"
                aria-label={`Delete ${img.filename}`}
                onClick={() => setPendingDelete(img)}
                className="text-zinc-400 transition-colors hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete image?"
        description={
          pendingDelete
            ? `"${pendingDelete.filename}" and its indexed vector will be permanently removed.`
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

function ImageStatus({ status, error }: { status: string; error?: string | null }) {
  if (status === "error") {
    return (
      <span className="text-red-600" title={error ?? undefined}>
        error
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <Spinner label="Processing" /> {status}
    </span>
  );
}
