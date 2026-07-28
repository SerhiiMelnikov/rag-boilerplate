import type { VectorStore, ChunkInput, RetrievedChunk, ChunkRow, ChunkPage } from "../types";
import { cosineSimilarity } from "../cosine";
import { weaviateCollection } from "./client";

// Minimal shape of the weaviate-client v3 collection handle this adapter uses.
export interface WeaviateObject {
  uuid: string;
  properties: Record<string, unknown>;
  metadata?: { distance?: number } | null;
  vectors?: { default?: number[] } | null;
}
export interface WeaviateCollectionLike {
  data: {
    insertMany(objs: { properties: Record<string, unknown>; vectors: number[] }[]): Promise<unknown>;
    deleteMany(where: unknown): Promise<unknown>;
  };
  query: {
    fetchObjects(args: { filters?: unknown; returnProperties?: string[]; limit?: number; offset?: number }): Promise<{ objects: WeaviateObject[] }>;
    nearVector(vector: number[], args: { limit: number; returnMetadata?: string[]; filters?: unknown }): Promise<{ objects: WeaviateObject[] }>;
    bm25(query: string, args: { limit: number; includeVector?: boolean; filters?: unknown }): Promise<{ objects: WeaviateObject[] }>;
  };
  filter: { byProperty(p: string): { equal(v: unknown): unknown; containsAny(v: unknown[]): unknown } };
}

function toChunk(o: WeaviateObject, score: number): RetrievedChunk {
  const p = o.properties ?? {};
  return {
    chunkId: o.uuid,
    documentId: String(p.documentId ?? ""),
    filename: String(p.filename ?? ""),
    content: String(p.content ?? ""),
    score,
  };
}

// Pre-Task-1 chunks have no chunkIndex property at all — surfaces as
// `undefined` here, parsed to null (a real "unknown position" value).
function toChunkRow(o: WeaviateObject): ChunkRow {
  const p = o.properties ?? {};
  return {
    chunkIndex: typeof p.chunkIndex === "number" ? p.chunkIndex : null,
    content: String(p.content ?? ""),
    contentHash: String(p.contentHash ?? ""),
  };
}

// Ascending, nulls last — never `?? 0`, which would sort unknown-position
// chunks as if they were first and misrepresent the document.
function byChunkIndex(a: ChunkRow, b: ChunkRow): number {
  if (a.chunkIndex === null) return b.chunkIndex === null ? 0 : 1;
  if (b.chunkIndex === null) return -1;
  return a.chunkIndex - b.chunkIndex;
}

// Weaviate rejects offset beyond QUERY_MAXIMUM_RESULTS (10000 by default) —
// used both to bound the "count everything" call below and documented again
// at the paged fetchObjects call that can hit the same ceiling.
const QUERY_MAXIMUM_RESULTS = 10000;

// The real weaviate-client v3 `Collection<T>` type ties `data.insertMany`'s
// parameter shape to the (unused, since we never specify TProperties) generic
// `T`, which makes it structurally too strict to line up with the minimal
// `WeaviateCollectionLike` shape below even though the runtime object accepts
// exactly the {properties, vectors} shape we send. Narrow the default via a
// cast rather than widening the shared interface for every call site.
const defaultGetCollection = weaviateCollection as unknown as () => Promise<WeaviateCollectionLike>;

// Weaviate-backed store. Chunks are objects in the RagChunk class (app-supplied
// vector + properties). Keyword search uses native BM25; because BM25 returns a
// relevance score (not cosine), the score field is recomputed as cosine from the
// returned object vector so the fusion contract (score = cosine) holds.
export function createWeaviateStore(
  getCollection: () => Promise<WeaviateCollectionLike> = defaultGetCollection,
): VectorStore {
  return {
    async upsertChunks(rows: ChunkInput[]) {
      if (rows.length === 0) return;
      const col = await getCollection();
      await col.data.insertMany(
        rows.map((r) => ({
          properties: { documentId: r.documentId, filename: r.filename, content: r.content, contentHash: r.contentHash, chunkIndex: r.chunkIndex },
          vectors: r.embedding,
        })),
      );
    },

    async existingHashes(documentId: string) {
      const col = await getCollection();
      const hashes = new Set<string>();
      const res = await col.query.fetchObjects({
        filters: col.filter.byProperty("documentId").equal(documentId),
        returnProperties: ["contentHash"],
        limit: 10000,
      });
      for (const o of res.objects) {
        const h = (o.properties ?? {}).contentHash;
        if (typeof h === "string") hashes.add(h);
      }
      return hashes;
    },

    async deleteByDocument(documentId: string) {
      const col = await getCollection();
      await col.data.deleteMany(col.filter.byProperty("documentId").equal(documentId));
    },

    async searchVector(embedding: number[], limit: number, allowedDocumentIds?: string[]): Promise<RetrievedChunk[]> {
      if (allowedDocumentIds && allowedDocumentIds.length === 0) return [];
      const col = await getCollection();
      const filters = allowedDocumentIds ? col.filter.byProperty("documentId").containsAny(allowedDocumentIds) : undefined;
      const res = await col.query.nearVector(embedding, { limit, returnMetadata: ["distance"], ...(filters ? { filters } : {}) });
      // Weaviate cosine "distance" = 1 - cosine similarity.
      return res.objects.map((o) => toChunk(o, 1 - (o.metadata?.distance ?? 1)));
    },

    async searchKeyword(query: string, embedding: number[], limit: number, allowedDocumentIds?: string[]): Promise<RetrievedChunk[]> {
      if (allowedDocumentIds && allowedDocumentIds.length === 0) return [];
      const text = query.trim();
      if (text.length < 2) return [];
      const col = await getCollection();
      const filters = allowedDocumentIds ? col.filter.byProperty("documentId").containsAny(allowedDocumentIds) : undefined;
      const res = await col.query.bm25(text, { limit, includeVector: true, ...(filters ? { filters } : {}) });
      return res.objects.map((o) => toChunk(o, cosineSimilarity(embedding, o.vectors?.default ?? [])));
    },

    async listChunks(documentId: string, opts: { limit: number; offset: number }): Promise<ChunkPage> {
      const col = await getCollection();
      const filters = col.filter.byProperty("documentId").equal(documentId);
      // The narrow WeaviateCollectionLike seam has no separate count/aggregate
      // primitive, so total reuses the same bounded-fetch primitive
      // existingHashes already relies on: a filtered fetchObjects call with no
      // offset, capped at the same QUERY_MAXIMUM_RESULTS ceiling. A document
      // with more chunks than that will under-report total — acceptable for an
      // admin preview, not the corpus-corruption path Task 3 addresses.
      const countRes = await col.query.fetchObjects({ filters, returnProperties: [], limit: QUERY_MAXIMUM_RESULTS });
      // Deep pages: offset beyond QUERY_MAXIMUM_RESULTS (10000 by default) is
      // rejected outright by Weaviate — a preview past chunk 10000 will fail.
      const page = await col.query.fetchObjects({
        filters,
        returnProperties: ["content", "contentHash", "chunkIndex"],
        limit: opts.limit,
        offset: opts.offset,
      });
      // fetchObjects has no server-side sort applied here, so — like Chroma and
      // Pinecone — only the returned page is guaranteed chunkIndex-ordered.
      const rows = page.objects.map(toChunkRow).sort(byChunkIndex);
      return { rows, total: countRes.objects.length };
    },
  };
}
