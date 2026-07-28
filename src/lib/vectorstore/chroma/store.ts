import { randomUUID } from "node:crypto";
import type { VectorStore, ChunkInput, RetrievedChunk, ChunkRow, ChunkPage } from "../types";
import { chromaCollection } from "./client";

// Minimal shape of a Chroma collection this adapter uses. Kept local so unit
// tests can inject a fake without importing the full chromadb types.
// where/metadata values used by this adapter are always plain strings
// (documentId, filename, content, contentHash), and whereDocument/include are
// each used with a single shape — typed narrowly (rather than
// Record<string, unknown>) so the real chromadb `Collection` (whose `Metadata`/
// `Where`/`WhereDocument` types restrict values to specific literals) is
// assignable as the default `getCollection` implementation.
export interface ChromaCollectionLike {
  add(args: { ids: string[]; embeddings: number[][]; documents: string[]; metadatas: Record<string, string>[] }): Promise<unknown>;
  get(args: { where?: Record<string, string>; include?: "metadatas"[] }): Promise<{ metadatas?: (Record<string, unknown> | null)[] }>;
  delete(args: { where?: Record<string, string> }): Promise<unknown>;
  query(args: { queryEmbeddings: number[][]; nResults: number; where?: { documentId: { $in: string[] } }; whereDocument?: { $contains: string } }): Promise<{
    ids: string[][];
    documents: (string | null)[][];
    metadatas: (Record<string, unknown> | null)[][];
    distances: (number | null)[][];
  }>;
}

// Chroma returns column-oriented results; index 0 is the single query. score is
// cosine similarity = 1 - cosine distance (collection created with hnsw:space=cosine).
function toChunks(res: {
  ids: string[][];
  documents: (string | null)[][];
  metadatas: (Record<string, unknown> | null)[][];
  distances: (number | null)[][];
}): RetrievedChunk[] {
  const ids = res.ids[0] ?? [];
  return ids.map((id, i) => {
    const meta = (res.metadatas[0]?.[i] ?? {}) as Record<string, unknown>;
    const dist = res.distances[0]?.[i];
    return {
      chunkId: id,
      documentId: String(meta.documentId ?? ""),
      filename: String(meta.filename ?? ""),
      content: String(res.documents[0]?.[i] ?? meta.content ?? ""),
      score: typeof dist === "number" ? 1 - dist : 0,
    };
  });
}

// ChromaCollectionLike metadata values are strings only, so chunkIndex was
// written as String(n) (see upsertChunks below) and must be parsed back here.
// Pre-Task-1 chunks have no chunkIndex key in metadata at all (undefined, not
// a string) — parsed to null, a real "unknown position" value, not an error.
function parseChunkIndex(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

function toChunkRow(m: Record<string, unknown>): ChunkRow {
  return {
    chunkIndex: parseChunkIndex(m.chunkIndex),
    content: String(m.content ?? ""),
    contentHash: String(m.contentHash ?? ""),
  };
}

// Ascending, nulls last — never `?? 0`, which would sort unknown-position
// chunks as if they were first and misrepresent the document.
function byChunkIndex(a: ChunkRow, b: ChunkRow): number {
  if (a.chunkIndex === null) return b.chunkIndex === null ? 0 : 1;
  if (b.chunkIndex === null) return -1;
  return a.chunkIndex - b.chunkIndex;
}

// Chroma-backed store. A chunk is a record (embedding + document text + metadata
// {documentId, filename, content, contentHash}). Keyword search uses whereDocument
// $contains (substring), ranked by vector score over the filtered subset — the
// same approximation class as Qdrant MatchText.
export function createChromaStore(
  getCollection: () => Promise<ChromaCollectionLike> = chromaCollection,
): VectorStore {
  return {
    async upsertChunks(rows: ChunkInput[]) {
      if (rows.length === 0) return;
      const col = await getCollection();
      await col.add({
        ids: rows.map(() => randomUUID()),
        embeddings: rows.map((r) => r.embedding),
        documents: rows.map((r) => r.content),
        metadatas: rows.map((r) => ({
          documentId: r.documentId,
          filename: r.filename,
          content: r.content,
          contentHash: r.contentHash,
          // ChromaCollectionLike constrains metadata values to strings (see the
          // interface note above); chunkIndex is stringified on write and must
          // be parsed back to a number by any future reader.
          chunkIndex: String(r.chunkIndex),
        })),
      });
    },

    async existingHashes(documentId: string) {
      const col = await getCollection();
      // No limit here, unlike Weaviate's equivalent: live-verified against a
      // 1200-row seeded collection that col.get({ where }) returns every match
      // with no cap, so nothing is missed. If a cap is ever hit in practice,
      // get() also accepts limit/offset, and the collection exposes count().
      const res = await col.get({ where: { documentId }, include: ["metadatas"] });
      const hashes = new Set<string>();
      for (const m of res.metadatas ?? []) {
        const h = (m ?? {}).contentHash;
        if (typeof h === "string") hashes.add(h);
      }
      return hashes;
    },

    async deleteByDocument(documentId: string) {
      const col = await getCollection();
      await col.delete({ where: { documentId } });
    },

    async searchVector(embedding: number[], limit: number, allowedDocumentIds?: string[]): Promise<RetrievedChunk[]> {
      if (allowedDocumentIds && allowedDocumentIds.length === 0) return [];
      const col = await getCollection();
      const res = await col.query({
        queryEmbeddings: [embedding],
        nResults: limit,
        ...(allowedDocumentIds ? { where: { documentId: { $in: allowedDocumentIds } } } : {}),
      });
      return toChunks(res);
    },

    async searchKeyword(query: string, embedding: number[], limit: number, allowedDocumentIds?: string[]): Promise<RetrievedChunk[]> {
      if (allowedDocumentIds && allowedDocumentIds.length === 0) return [];
      const text = query.trim();
      if (text.length < 2) return [];
      const col = await getCollection();
      const res = await col.query({
        queryEmbeddings: [embedding],
        nResults: limit,
        whereDocument: { $contains: text },
        ...(allowedDocumentIds ? { where: { documentId: { $in: allowedDocumentIds } } } : {}),
      });
      return toChunks(res);
    },

    async listChunks(documentId: string, opts: { limit: number; offset: number }): Promise<ChunkPage> {
      // ChromaCollectionLike's get() has no limit/offset of its own (see the
      // interface above), so — like existingHashes — this fetches every chunk
      // matching the filter, then sorts and slices client-side. The interface
      // contract only promises "ordered within the returned page" (not global
      // order) precisely to leave room for a future, cheaper Chroma
      // implementation that doesn't fetch everything to answer one page.
      const col = await getCollection();
      const res = await col.get({ where: { documentId }, include: ["metadatas"] });
      const all = (res.metadatas ?? []).map((m) => toChunkRow((m ?? {}) as Record<string, unknown>));
      const sorted = all.sort(byChunkIndex);
      return { rows: sorted.slice(opts.offset, opts.offset + opts.limit), total: all.length };
    },
  };
}
