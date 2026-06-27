interface SourceRef {
  documentId: string;
  filename: string;
  chunkId: string;
  score: number;
}

// Dedupe sources by filename, keeping the highest score; render nothing if empty.
export function Sources({ sources }: { sources: SourceRef[] }) {
  if (!sources.length) return null;
  const best = new Map<string, number>();
  for (const s of sources) best.set(s.filename, Math.max(best.get(s.filename) ?? 0, s.score));
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
      <span>Sources:</span>
      {[...best.entries()].map(([filename, score]) => (
        <span key={filename} className="rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
          {filename} ({score.toFixed(2)})
        </span>
      ))}
    </div>
  );
}
