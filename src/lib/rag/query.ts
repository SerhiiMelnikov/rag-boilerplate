import type { RetrievedChunk } from "./retrieve";

// Format retrieved chunks into a numbered context block with source markers.
export function buildContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map((c, i) => `[${i + 1}] (source: ${c.filename})\n${c.content}`)
    .join("\n\n");
}
