import { randomUUID } from "node:crypto";
import type { VectorStore, ChunkInput, RetrievedChunk } from "../types";
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
        })),
      });
    },

    async existingHashes(documentId: string) {
      const col = await getCollection();
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
  };
}
