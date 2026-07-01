// Target embedding dimension. Install-time env because it is baked into the
// vector(N) column; not exposed in the admin UI. Default matches the golden
// path (gemini-embedding-2 @ 768).
export const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS) || 768;

// Validate that a produced embedding matches the stored column width. Different
// models emit different widths; a mismatch would silently corrupt retrieval, so
// we throw instead of truncating.
export function assertEmbeddingDimension(vec: number[]): number[] {
  if (vec.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding model returned ${vec.length} dimensions, expected ${EMBEDDING_DIMENSIONS} — ` +
        `set EMBEDDING_DIMENSIONS=${vec.length} or choose a model that outputs ${EMBEDDING_DIMENSIONS}.`,
    );
  }
  return vec;
}
