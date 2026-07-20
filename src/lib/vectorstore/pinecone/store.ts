import { randomUUID } from "node:crypto";
import type { VectorStore, ChunkInput, RetrievedChunk } from "../types";
import { cosineSimilarity } from "../cosine";
import { denseIndex, sparseIndex } from "./client";

// Minimal shapes of the two Pinecone index handles this adapter uses.
export interface PineconeDenseLike {
  upsert(records: { id: string; values: number[]; metadata: Record<string, unknown> }[]): Promise<unknown>;
  query(args: { vector: number[]; topK: number; includeMetadata: boolean; filter?: Record<string, unknown> }): Promise<{ matches?: { id: string; score?: number; metadata?: Record<string, unknown> }[] }>;
  fetch(ids: string[]): Promise<{ records: Record<string, { id: string; values?: number[]; metadata?: Record<string, unknown> }> }>;
  listPaginated(args: { prefix: string; paginationToken?: string }): Promise<{ vectors?: { id: string }[]; pagination?: { next?: string } }>;
  deleteMany(ids: string[]): Promise<unknown>;
}
export interface PineconeSparseLike {
  upsertRecords(records: { _id: string; text: string }[]): Promise<unknown>;
  searchRecords(args: { query: { topK: number; inputs: { text: string } } }): Promise<{ result: { hits: { _id: string }[] } }>;
  deleteMany(ids: string[]): Promise<unknown>;
}

// Pinecone caps a fetch or delete request at ~1000 ids. A document large enough to
// produce more chunks than that would otherwise fail the whole operation, so split.
const PINECONE_BATCH = 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchAllRecords(
  dense: PineconeDenseLike,
  ids: string[],
): Promise<Record<string, { id: string; values?: number[]; metadata?: Record<string, unknown> }>> {
  const records: Record<string, { id: string; values?: number[]; metadata?: Record<string, unknown> }> = {};
  for (const batch of chunk(ids, PINECONE_BATCH)) {
    const res = await dense.fetch(batch);
    Object.assign(records, res.records);
  }
  return records;
}

async function deleteAllIds(index: { deleteMany(ids: string[]): Promise<unknown> }, ids: string[]): Promise<void> {
  for (const batch of chunk(ids, PINECONE_BATCH)) {
    await index.deleteMany(batch);
  }
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
//
// The index handles are built lazily (denseFn/sparseFn are called inside each
// method, not at construction) so that selecting VECTOR_STORE=pinecone does not
// require PINECONE_API_KEY until a store method actually runs — matching the
// "construct without connecting" behavior of the other adapters.
export function createPineconeStore(
  denseFn: () => PineconeDenseLike = () => denseIndex(),
  sparseFn: () => PineconeSparseLike = () => sparseIndex(),
): VectorStore {
  return {
    async upsertChunks(rows: ChunkInput[]) {
      if (rows.length === 0) return;
      const dense = denseFn();
      const sparse = sparseFn();
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
      const dense = denseFn();
      const ids = await idsForDocument(dense, documentId);
      const hashes = new Set<string>();
      if (ids.length === 0) return hashes;
      const records = await fetchAllRecords(dense, ids);
      for (const rec of Object.values(records)) {
        const h = (rec.metadata ?? {}).contentHash;
        if (typeof h === "string") hashes.add(h);
      }
      return hashes;
    },

    async deleteByDocument(documentId: string) {
      const dense = denseFn();
      const sparse = sparseFn();
      const ids = await idsForDocument(dense, documentId);
      if (ids.length === 0) return;
      await deleteAllIds(dense, ids);
      await deleteAllIds(sparse, ids);
    },

    async searchVector(embedding: number[], limit: number, allowedDocumentIds?: string[]): Promise<RetrievedChunk[]> {
      if (allowedDocumentIds && allowedDocumentIds.length === 0) return [];
      const dense = denseFn();
      const res = await dense.query({
        vector: embedding,
        topK: limit,
        includeMetadata: true,
        ...(allowedDocumentIds ? { filter: { documentId: { $in: allowedDocumentIds } } } : {}),
      });
      return (res.matches ?? []).map((m) => metaToChunk(m.id, m.metadata ?? {}, typeof m.score === "number" ? m.score : 0));
    },

    async searchKeyword(query: string, embedding: number[], limit: number, allowedDocumentIds?: string[]): Promise<RetrievedChunk[]> {
      if (allowedDocumentIds && allowedDocumentIds.length === 0) return [];
      const text = query.trim();
      if (text.length < 2) return [];
      const dense = denseFn();
      const sparse = sparseFn();
      const hits = await sparse.searchRecords({ query: { topK: limit, inputs: { text } } });
      const ids = hits.result.hits.map((h) => h._id);
      if (ids.length === 0) return [];
      const fetched = await fetchAllRecords(dense, ids);
      // The sparse index has no metadata to filter on, so scope post-fetch by the
      // documentId carried in each dense record's metadata. Preserve keyword order.
      const allow = allowedDocumentIds ? new Set(allowedDocumentIds) : null;
      return ids
        .map((id) => fetched[id])
        .filter((rec): rec is NonNullable<typeof rec> => Boolean(rec))
        .filter((rec) => !allow || allow.has(String((rec.metadata ?? {}).documentId ?? "")))
        .map((rec) => metaToChunk(rec.id, rec.metadata ?? {}, cosineSimilarity(embedding, rec.values ?? [])));
    },
  };
}
