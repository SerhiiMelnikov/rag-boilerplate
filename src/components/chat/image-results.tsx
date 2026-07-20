"use client";

import { useState } from "react";
import { ImageLightbox } from "./image-lightbox";

interface ImageResultRef {
  imageId: string;
  caption: string;
}

// Retrieved images as thumbnails. Clicking one opens it in the lightbox on this page,
// keeping the user in the conversation, and lets them page through the other results.
export function ImageResults({ images }: { images: ImageResultRef[] }) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  if (!images.length) return null;
  const single = images.length === 1;

  return (
    <>
      <div className={single ? "mt-2" : "mt-2 flex flex-wrap gap-2"}>
        {images.map((img, i) => (
          <button
            key={img.imageId}
            type="button"
            aria-label={img.caption ? `Open image: ${img.caption}` : "Open image"}
            onClick={() => setOpenAt(i)}
            className="rounded transition-opacity hover:opacity-80"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- served bytes, not a static asset */}
            <img
              src={`/api/images/${img.imageId}`}
              alt={img.caption}
              className={single ? "max-h-80 max-w-full rounded object-contain" : "h-32 w-32 rounded object-cover"}
            />
          </button>
        ))}
      </div>
      {openAt !== null && (
        <ImageLightbox images={images} startIndex={openAt} onClose={() => setOpenAt(null)} />
      )}
    </>
  );
}
