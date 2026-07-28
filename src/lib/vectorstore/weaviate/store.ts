import { Filters } from "weaviate-client";
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
    fetchObjects(args: { filters?: unknown; returnProperties?: string[]; limit?: number; offset?: number; sort?: unknown }): Promise<{ objects: WeaviateObject[] }>;
    nearVector(vector: number[], args: { limit: number; returnMetadata?: string[]; filters?: unknown }): Promise<{ objects: WeaviateObject[] }>;
    bm25(query: string, args: { limit: number; includeVector?: boolean; filters?: unknown }): Promise<{ objects: WeaviateObject[] }>;
  };
  filter: {
    byProperty(p: string): { equal(v: unknown): unknown; containsAny(v: unknown[]): unknown; greaterOrEqual(v: number): unknown };
  };
  sort: { byProperty(p: string, ascending?: boolean): unknown };
  aggregate: { overAll(args: { filters?: unknown }): Promise<{ totalCount: number }> };
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

// Weaviate rejects offset beyond QUERY_MAXIMUM_RESULTS (10000 by default) — a
// preview past chunk 10000 will fail; noted again at the paged fetchObjects
// call in listChunks below that can hit this ceiling.

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
      const documentFilter = col.filter.byProperty("documentId").equal(documentId);

      // total: aggregate.overAll({filters}) — one cheap call, exact count, no
      // wire transfer and no ceiling (replaces an earlier bounded-fetchObjects
      // count that under-reported past 10000 rows).
      const total = (await col.aggregate.overAll({ filters: documentFilter })).totalCount;

      // Weaviate's `sort` composes with a filter and returns genuinely
      // globally-ordered pages (live-probed: 40 chunks inserted in shuffled
      // order — page1 chunkIndex 0-9, page2 10-19, via
      // `fetchObjects({ filters, sort, limit, offset })`).
      //
      // BUT (also live-probed, and the reason this isn't used unconditionally):
      // an object that's missing the sorted property ENTIRELY — exactly the
      // pre-Task-1 "no recorded chunkIndex" case this whole feature exists to
      // handle correctly — is silently DROPPED from every sorted page rather
      // than sorted first/last. Confirmed with 20 normal + 2 legacy (no
      // chunkIndex) chunks: aggregate.overAll counted 22, but paging through
      // `sort`-ed results only ever surfaced the 20 that had chunkIndex, with
      // the last page short instead of containing the legacy two. Isolating
      // them with an `isNull` filter would need `indexNullState: true` added
      // to the class's inverted index config — a schema migration (Weaviate
      // rejects the filter outright without it: "Nullstate must be indexed to
      // be filterable") out of this task's scope.
      //
      // So: use a plain numeric range filter (chunkIndex is 0-based, so >= 0
      // matches every real value and — live-probed — naturally excludes
      // objects missing the property, no schema change needed) to count how
      // many of this document's chunks actually HAVE chunkIndex set. Only take
      // the sort fast path when that equals `total`, i.e. nothing in this
      // document would be silently dropped by sorting. Documents with any
      // legacy chunk instead fall back to the plain filtered fetch (no sort) —
      // safe, but page-local order only, same as Chroma/Pinecone.
      // Bridged with `never` (not `any`): the seam types filter values as
      // `unknown` on purpose (see the `filter` interface above), but
      // Filters.and — a plain, stateless combinator, not a collection method —
      // needs the real weaviate-client FilterValue shape.
      //
      // TOCTOU note: `total`, `hasChunkIndexTotal`, and the fetchObjects call
      // below are three separate round trips, so a legacy chunk written
      // between the first aggregate and the final fetch could in principle
      // still slip onto the sort fast path and get dropped. Not engineered
      // around: chunks are written once per ingest batch (upsertChunks), not
      // trickled in concurrently with a read, so this window is not a
      // realistic write pattern for this data — noted so the next reader
      // knows it was considered, not missed.
      const hasChunkIndexFilter = Filters.and(documentFilter as never, col.filter.byProperty("chunkIndex").greaterOrEqual(0) as never);
      const hasChunkIndexTotal = (await col.aggregate.overAll({ filters: hasChunkIndexFilter })).totalCount;
      const canSortServerSide = hasChunkIndexTotal === total;

      // Deep pages: offset beyond QUERY_MAXIMUM_RESULTS (10000 by default) is
      // rejected outright by Weaviate — a preview past chunk 10000 will fail,
      // on either path below.
      const page = canSortServerSide
        ? await col.query.fetchObjects({
            filters: documentFilter,
            returnProperties: ["content", "contentHash", "chunkIndex"],
            sort: col.sort.byProperty("chunkIndex", true),
            limit: opts.limit,
            offset: opts.offset,
          })
        : await col.query.fetchObjects({
            filters: documentFilter,
            returnProperties: ["content", "contentHash", "chunkIndex"],
            limit: opts.limit,
            offset: opts.offset,
          });

      // Kept on both paths: a no-op when the server already sorted (order is
      // unchanged), and it's the only ordering guarantee left when we fell back
      // to the unsorted fetch — but the server-side sort above is the
      // load-bearing one whenever this document has no legacy chunks.
      const rows = page.objects.map(toChunkRow).sort(byChunkIndex);
      return { rows, total };
    },
  };
}
