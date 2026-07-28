import { createHash } from "node:crypto";
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
    insertMany(objs: { id?: string; properties: Record<string, unknown>; vectors: number[] }[]): Promise<unknown>;
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
// call in listChunks below that can hit this ceiling, and enforced in the
// existingHashes paging loop so it never issues the rejected offset itself.
const QUERY_MAXIMUM_RESULTS = 10_000;

// The real weaviate-client v3 `Collection<T>` type ties `data.insertMany`'s
// parameter shape to the (unused, since we never specify TProperties) generic
// `T`, which makes it structurally too strict to line up with the minimal
// `WeaviateCollectionLike` shape below even though the runtime object accepts
// exactly the {properties, vectors} shape we send. Narrow the default via a
// cast rather than widening the shared interface for every call site.
const defaultGetCollection = weaviateCollection as unknown as () => Promise<WeaviateCollectionLike>;

// A fixed, arbitrary namespace for the chunk-id derivation below (generated once,
// then hardcoded — any valid UUID works as a v5 namespace, it only has to be
// constant so the same input always maps to the same output).
const CHUNK_ID_NAMESPACE = "6f6a1b2e-9c1a-4b8b-8e2b-2f7a2b9d6e11";

// RFC 4122 UUIDv5 (namespace + name, SHA-1) built on node:crypto's hash
// primitive rather than pulling in a "uuid" dependency for one function.
// Verified against the RFC's own DNS-namespace test vector.
function uuidv5(name: string, namespace: string): string {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const digest = createHash("sha1").update(nsBytes).update(name, "utf8").digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Without a stable id, insertMany hands every object a fresh random UUID, so
// re-ingesting a document that hasn't changed inserts every one of its chunks
// again instead of updating the originals — the corpus duplicates on every
// re-ingest and grows without bound. Deriving the id from (documentId,
// chunkIndex, contentHash) keeps that idempotent: unchanged content at an
// unchanged position, re-ingested, targets the exact same object id, and
// Weaviate overwrites it in place instead of adding a second copy —
// live-verified: insertMany with an id that already exists replaces
// properties and leaves the object count unchanged. chunkIndex has to be part
// of the id (not just documentId + contentHash): ingest.ts doesn't dedupe
// within a batch, so a document containing the same text twice at two
// different positions would otherwise send two rows with identical
// (documentId, contentHash) — identical ids — and the second silently
// overwrites the first with no error, losing the earlier position and
// leaving `total`/existingHashes permanently short by one. Including
// chunkIndex keeps distinct positions as distinct objects while unchanged
// content at an unchanged position still collapses onto the same id.
function chunkObjectId(documentId: string, chunkIndex: number, contentHash: string): string {
  return uuidv5(`${documentId}:${chunkIndex}:${contentHash}`, CHUNK_ID_NAMESPACE);
}

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
          id: chunkObjectId(r.documentId, r.chunkIndex, r.contentHash),
          properties: { documentId: r.documentId, filename: r.filename, content: r.content, contentHash: r.contentHash, chunkIndex: r.chunkIndex },
          vectors: r.embedding,
        })),
      );
    },

    async existingHashes(documentId: string) {
      const col = await getCollection();
      const hashes = new Set<string>();
      const documentFilter = col.filter.byProperty("documentId").equal(documentId);
      const PAGE_SIZE = 500;
      // Page with `offset` (not the `after` cursor — live-probed: the cursor is
      // rejected outright when a filter is present) until a short page comes
      // back. Weaviate refuses any offset >= QUERY_MAXIMUM_RESULTS outright
      // (an "invalid pagination" error, not a graceful truncation), so the
      // loop condition below stops one page short of ever issuing that offset,
      // rather than looping unconditionally and letting the request past the
      // ceiling fail the whole call — that used to turn a >=10000-chunk
      // document into ingestExistingDocument catching the error and marking
      // the entire document `status: "error"` with nothing stored, strictly
      // worse than returning a merely truncated set. A document at or beyond
      // the ceiling still only gets a truncated hash set — no amount of paging
      // can lift that ceiling — but that's acceptable: the chunks past it just
      // look "new" on the next ingest and get redundantly re-embedded and
      // re-upserted, which costs extra embedding work, not correctness, because
      // chunk ids are deterministic (see chunkObjectId above), so the re-upsert
      // overwrites in place instead of duplicating.
      for (let offset = 0; offset < QUERY_MAXIMUM_RESULTS; offset += PAGE_SIZE) {
        const res = await col.query.fetchObjects({
          filters: documentFilter,
          returnProperties: ["contentHash"],
          limit: PAGE_SIZE,
          offset,
        });
        for (const o of res.objects) {
          const h = (o.properties ?? {}).contentHash;
          if (typeof h === "string") hashes.add(h);
        }
        if (res.objects.length < PAGE_SIZE) break;
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
