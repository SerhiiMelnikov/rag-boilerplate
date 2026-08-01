"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Dialog } from "@/components/ui/dialog";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { cn } from "@/lib/cn";

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

  // Re-run the vision model on the stored image. Nothing is re-uploaded — this is how
  // an image captioned under an older prompt gets a fresh description.
  async function regenerate() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/images/${image.id}/recaption`, { method: "POST" });
      if (res.ok) onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={image.filename} size="lg">
      {/* eslint-disable-next-line @next/next/no-img-element -- served bytes, not a static asset */}
      <img src={`/api/images/${image.id}`} alt={image.filename} className="mb-3 max-h-[50vh] w-full rounded object-contain" />
      <label className="flex flex-col gap-1 text-sm">
        Caption (used for search)
        <textarea
          aria-label="Caption"
          value={caption}
          rows={4}
          onChange={(e) => setCaption(e.target.value)}
          className={cn("rounded border border-border-strong bg-transparent px-3 py-2", FOCUS_RING)}
        />
      </label>
      <div className="mt-3 flex items-center gap-3">
        <Button type="button" disabled={saving || caption.trim().length === 0} onClick={save}>
          {saving ? "Saving..." : "Save caption"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={regenerate}
          title="Re-run the image analyzer on this image"
        >
          <Sparkles className="h-4 w-4" /> Regenerate
        </Button>
        {image.status === "processing" && (
          <span className="flex items-center gap-1.5 text-sm text-ink-muted"><Spinner label="Re-embedding" /> re-embedding…</span>
        )}
      </div>
    </Dialog>
  );
}
