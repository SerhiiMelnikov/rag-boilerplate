interface ImageResultRef {
  imageId: string;
  filename: string;
  score: number;
}

// Render retrieved images as thumbnails linking to the auth-gated serving route.
export function ImageResults({ images }: { images: ImageResultRef[] }) {
  if (!images.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {images.map((img) => (
        <a key={img.imageId} href={`/api/images/${img.imageId}`} target="_blank" rel="noreferrer" title={`${img.filename} (${img.score.toFixed(2)})`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- served bytes, not a static asset */}
          <img src={`/api/images/${img.imageId}`} alt={img.filename} className="h-32 w-32 rounded object-cover" />
        </a>
      ))}
    </div>
  );
}
