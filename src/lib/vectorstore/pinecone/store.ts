import { randomUUID } from "node:crypto";
import type { VectorStore, ChunkInput, RetrievedChunk } from "../types";
import { cosineSimilarity } from "../cosine";
import { denseIndex, sparseIndex } from "./client";

// Minimal shapes of the two Pinecone index handles this adapter uses.
export interface PineconeDenseLike {
  upsert(records: { id: string; values: number[]; metadata: Record<string, unknown> }[]): Promise<unknown>;
  query(args: { vector: number[]; topK: number; includeMetadata: boolean }): Promise<{ matches?: { id: string; score?: number; metadata?: Record<string, unknown> }[] }>;
  fetch(ids: string[]): Promise<{ records: Record<string, { id: string; values?: number[]; metadata?: Record<string, unknown> }> }>;
  listPaginated(args: { prefix: string; paginationToken?: string }): Promise<{ vectors?: { id: string }[]; pagination?: { next?: string } }>;
  deleteMany(ids: string[]): Promise<unknown>;
}
export interface PineconeSparseLike {
  upsertRecords(records: { _id: string; text: string }[]): Promise<unknown>;
  searchRecords(args: { query: { topK: number; inputs: { text: string } } }): Promise<{ result: { hits: { _id: string }[] } }>;
  deleteMany(ids: string[]): Promise<unknown>;
}

function metaToChunk(id: string, meta: Record<string, unknown>, score: number): RetrievedChunk {
  return {
    chunkId: id,
    documentId: String(meta.documentId ?? ""),
    filename: String(meta.filename ?? ""),
    content: String(meta.content ?? ""),
    score,
  };
}

// List every chunk id under a document (serverless has no metadata scroll, so
// ids are prefixed `${documentId}#` and enumerated by prefix).
async function idsForDocument(dense: PineconeDenseLike, documentId: string): Promise<string[]> {
  const ids: string[] = [];
  let token: string | undefined;
  do {
    const page = await dense.listPaginated({ prefix: `${documentId}#`, paginationToken: token });
    for (const v of page.vectors ?? []) ids.push(v.id);
    token = page.pagination?.next;
  } while (token);
  return ids;
}

// Pinecone-backed store (sparse-dense). Dense index holds app-supplied vectors;
// sparse index holds text embedded by Pinecone's hosted sparse model for keyword
// search. searchKeyword returns cosine scores (recomputed from fetched dense
// vectors) so the fusion contract (score = cosine) holds.
export function createPineconeStore(
  dense: PineconeDenseLike = denseIndex() as never,
  sparse: PineconeSparseLike = sparseIndex() as never,
): VectorStore {
  return {
    async upsertChunks(rows: ChunkInput[]) {
      if (rows.length === 0) return;
      const withIds = rows.map((r) => ({ id: `${r.documentId}#${randomUUID()}`, row: r }));
      await dense.upsert(
        withIds.map(({ id, row }) => ({
          id,
          values: row.embedding,
          metadata: { documentId: row.documentId, filename: row.filename, content: row.content, contentHash: row.contentHash },
        })),
      );
      await sparse.upsertRecords(withIds.map(({ id, row }) => ({ _id: id, text: row.content })));
    },

    async existingHashes(documentId: string) {
      const ids = await idsForDocument(dense, documentId);
      const hashes = new Set<string>();
      if (ids.length === 0) return hashes;
      const res = await dense.fetch(ids);
      for (const rec of Object.values(res.records)) {
        const h = (rec.metadata ?? {}).contentHash;
        if (typeof h === "string") hashes.add(h);
      }
      return hashes;
    },

    async deleteByDocument(documentId: string) {
      const ids = await idsForDocument(dense, documentId);
      if (ids.length === 0) return;
      await dense.deleteMany(ids);
      await sparse.deleteMany(ids);
    },

    async searchVector(embedding: number[], limit: number): Promise<RetrievedChunk[]> {
      const res = await dense.query({ vector: embedding, topK: limit, includeMetadata: true });
      return (res.matches ?? []).map((m) => metaToChunk(m.id, m.metadata ?? {}, typeof m.score === "number" ? m.score : 0));
    },

    async searchKeyword(query: string, embedding: number[], limit: number): Promise<RetrievedChunk[]> {
      const text = query.trim();
      if (text.length < 2) return [];
      const hits = await sparse.searchRecords({ query: { topK: limit, inputs: { text } } });
      const ids = hits.result.hits.map((h) => h._id);
      if (ids.length === 0) return [];
      const fetched = await dense.fetch(ids);
      // Preserve the sparse (keyword) ordering; score is cosine from the dense vector.
      return ids
        .map((id) => fetched.records[id])
        .filter((rec): rec is NonNullable<typeof rec> => Boolean(rec))
        .map((rec) => metaToChunk(rec.id, rec.metadata ?? {}, cosineSimilarity(embedding, rec.values ?? [])));
    },
  };
}
