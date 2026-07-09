"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

interface ImageModalProps {
  image: { id: string; filename: string; caption: string; status: string };
  onClose: () => void;
  onSaved: () => void;
}

// Image viewer + caption editor. Saving PATCHes the caption; the parent list then
// polls the row to "ready" while the re-embed runs in the background.
export function ImageModal({ image, onClose, onSaved }: ImageModalProps) {
  const [caption, setCaption] = useState(image.caption);
  const [saving, setSaving] = useState(false);

  // Allow closing the modal with the Escape key, as expected for dialogs.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/images/${image.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caption: caption.trim() }),
      });
      if (res.ok) onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`Image ${image.filename}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-4 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <span className="truncate text-sm font-medium">{image.filename}</span>
          <button type="button" aria-label="Close" onClick={onClose} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"><X className="h-4 w-4" /></button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- served bytes, not a static asset */}
        <img src={`/api/images/${image.id}`} alt={image.filename} className="mb-3 max-h-[50vh] w-full rounded object-contain" />
        <label className="flex flex-col gap-1 text-sm">
          Caption (used for search)
          <textarea aria-label="Caption" value={caption} rows={4} onChange={(e) => setCaption(e.target.value)} className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700" />
        </label>
        <div className="mt-3 flex items-center gap-3">
          <button type="button" disabled={saving || caption.trim().length === 0} onClick={save} className="rounded-md bg-zinc-900 px-4 py-2 text-white transition-opacity disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
            {saving ? "Saving..." : "Save caption"}
          </button>
          {image.status === "processing" && (
            <span className="flex items-center gap-1.5 text-sm text-zinc-500"><Spinner label="Re-embedding" /> re-embedding…</span>
          )}
        </div>
      </div>
    </div>
  );
}
