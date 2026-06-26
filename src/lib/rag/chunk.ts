export interface ChunkOptions {
  chunkSize?: number;
  overlap?: number;
}

// Sliding-window character chunker with overlap. Prefers to break on a
// paragraph/sentence/space boundary near the window end to avoid mid-word cuts.
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const chunkSize = opts.chunkSize ?? 1000;
  const overlap = opts.overlap ?? 150;
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= chunkSize) return [trimmed];

  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    let end = Math.min(start + chunkSize, trimmed.length);
    if (end < trimmed.length) {
      const window = trimmed.slice(start, end);
      const boundary = Math.max(
        window.lastIndexOf("\n\n"),
        window.lastIndexOf("\n"),
        window.lastIndexOf(". "),
        window.lastIndexOf(" "),
      );
      if (boundary > chunkSize * 0.5) end = start + boundary + 1;
    }
    chunks.push(trimmed.slice(start, end).trim());
    if (end >= trimmed.length) break;
    start = end - overlap;
  }
  return chunks.filter((c) => c.length > 0);
}
