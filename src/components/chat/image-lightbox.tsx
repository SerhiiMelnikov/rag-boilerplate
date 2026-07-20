"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface ImageResultRef {
  imageId: string;
  caption: string;
}

const iconButton =
  "rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70";

// Full-size viewer for the images returned in a chat answer. Opening a result used to
// navigate away to the raw serving route in a new tab, which dropped the user out of
// the conversation. Escape / the close button / a backdrop click dismiss it; with more
// than one result the arrow keys and the chevrons step through them (wrapping around).
export function ImageLightbox({
  images,
  startIndex,
  onClose,
}: {
  images: ImageResultRef[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const many = images.length > 1;

  const step = useCallback(
    (delta: number) => setIndex((i) => (i + delta + images.length) % images.length),
    [images.length],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (!many) return;
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, step, many]);

  const current = images[index];
  if (!current) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.caption ? `Image: ${current.caption}` : "Image"}
      data-testid="lightbox-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      {/* stopPropagation so the click does not also reach the backdrop below it. */}
      <button
        type="button"
        aria-label="Close"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className={`absolute right-4 top-4 ${iconButton}`}
      >
        <X className="h-5 w-5" />
      </button>

      {many && (
        <button
          type="button"
          aria-label="Previous image"
          onClick={(e) => { e.stopPropagation(); step(-1); }}
          className={`absolute left-4 ${iconButton}`}
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element -- served bytes, not a static asset */}
      <img
        src={`/api/images/${current.imageId}`}
        alt={current.caption}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-full rounded object-contain"
      />

      {many && (
        <button
          type="button"
          aria-label="Next image"
          onClick={(e) => { e.stopPropagation(); step(1); }}
          className={`absolute right-4 ${iconButton}`}
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {many && (
        <div className="absolute bottom-4 text-xs text-white/70">
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
