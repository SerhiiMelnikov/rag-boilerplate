import { randomUUID } from "node:crypto";
import type { QdrantClient } from "@qdrant/js-client-rest";
import type { VectorStore, ChunkInput, RetrievedChunk, ChunkRow, ChunkPage } from "../types";
import { qdrantClient, QDRANT_COLLECTION } from "./client";

type Point = { id: string | number; score?: number; payload?: Record<string, unknown> | null };

function toChunk(p: Point): RetrievedChunk {
  const payload = (p.payload ?? {}) as Record<string, unknown>;
  return {
    chunkId: String(p.id),
    documentId: String(payload.documentId ?? ""),
    filename: String(payload.filename ?? ""),
    content: String(payload.content ?? ""),
    score: typeof p.score === "number" ? p.score : 0,
  };
}

function toChunkRow(p: Point): ChunkRow {
  const payload = (p.payload ?? {}) as Record<string, unknown>;
  // chunkIndex is stored as a native number (see upsertChunks below); pre-Task-1
  // chunks have no such payload key at all, which surfaces here as `undefined`.
  return {
    chunkIndex: typeof payload.chunkIndex === "number" ? payload.chunkIndex : null,
    content: String(payload.content ?? ""),
    contentHash: String(payload.contentHash ?? ""),
  };
}

// Ascending, nulls last — never `?? 0`, which would sort unknown-position
// chunks as if they were first and misrepresent the document.
function byChunkIndex(a: ChunkRow, b: ChunkRow): number {
  if (a.chunkIndex === null) return b.chunkIndex === null ? 0 : 1;
  if (b.chunkIndex === null) return -1;
  return a.chunkIndex - b.chunkIndex;
}

const documentFilter = (documentId: string) => ({ must: [{ key: "documentId", match: { value: documentId } }] });

// Qdrant-backed store. A chunk is a point (vector = embedding, payload =
// {documentId, content, contentHash, filename}). Keyword search uses a full-text
// payload index + MatchText, ranked by vector score (Qdrant has no ts_rank/BM25,
// so hybrid is slightly weaker than pgvector but the interface is identical).
export function createQdrantStore(client: QdrantClient = qdrantClient(), collection = QDRANT_COLLECTION): VectorStore {
  return {
    async upsertChunks(rows: ChunkInput[]) {
      if (rows.length === 0) return;
      await client.upsert(collection, {
        wait: true,
        points: rows.map((r) => ({
          id: randomUUID(),
          vector: r.embedding,
          payload: { documentId: r.documentId, content: r.content, contentHash: r.contentHash, filename: r.filename, chunkIndex: r.chunkIndex },
        })),
      });
    },

    async existingHashes(documentId: string) {
      const hashes = new Set<string>();
      let offset: unknown = undefined;
      // Scroll all points for this document, collecting their content hashes.
      do {
        const res = await client.scroll(collection, {
          filter: { must: [{ key: "documentId", match: { value: documentId } }] },
          with_payload: true,
          limit: 256,
          offset: offset as never,
        });
        for (const p of res.points as Point[]) {
          const h = (p.payload as Record<string, unknown> | undefined)?.contentHash;
          if (typeof h === "string") hashes.add(h);
        }
        offset = (res as { next_page_offset?: unknown }).next_page_offset ?? null;
      } while (offset !== null && offset !== undefined);
      return hashes;
    },

    async deleteByDocument(documentId: string) {
      await client.delete(collection, {
        wait: true,
        filter: { must: [{ key: "documentId", match: { value: documentId } }] },
      });
    },

    async searchVector(embedding: number[], limit: number, allowedDocumentIds?: string[]): Promise<RetrievedChunk[]> {
      if (allowedDocumentIds && allowedDocumentIds.length === 0) return [];
      const res = await client.query(collection, {
        query: embedding,
        limit,
        with_payload: true,
        ...(allowedDocumentIds ? { filter: { must: [{ key: "documentId", match: { any: allowedDocumentIds } }] } } : {}),
      });
      return (res.points as Point[]).map(toChunk);
    },

    async searchKeyword(query: string, embedding: number[], limit: number, allowedDocumentIds?: string[]): Promise<RetrievedChunk[]> {
      if (allowedDocumentIds && allowedDocumentIds.length === 0) return [];
      const text = query.trim();
      if (text.length < 2) return [];
      // MatchText requires a full-text payload index on `content` (created at init).
      // Rank by vector score over the keyword-filtered subset.
      const must: unknown[] = [{ key: "content", match: { text } }];
      if (allowedDocumentIds) must.push({ key: "documentId", match: { any: allowedDocumentIds } });
      const res = await client.query(collection, {
        query: embedding,
        limit,
        with_payload: true,
        filter: { must },
      });
      return (res.points as Point[]).map(toChunk);
    },

    async listChunks(documentId: string, opts: { limit: number; offset: number }): Promise<ChunkPage> {
      // Qdrant's scroll `offset` is an opaque cursor, not a numeric skip, and
      // scroll's natural order is by point id (random UUIDs at write time),
      // unrelated to chunkIndex. So page forward from the start, collecting
      // points, until we've walked at least `offset + limit` of them (or run
      // out); sort what was collected by chunkIndex (nulls last) and slice the
      // requested window from it.
      const need = opts.offset + opts.limit;
      const collected: Point[] = [];
      let cursor: unknown = undefined;
      let exhausted = false;
      do {
        const res = await client.scroll(collection, {
          filter: documentFilter(documentId),
          with_payload: true,
          limit: 256,
          offset: cursor as never,
        });
        collected.push(...(res.points as Point[]));
        const next = (res as { next_page_offset?: unknown }).next_page_offset ?? null;
        if (next === null || next === undefined) {
          exhausted = true;
          break;
        }
        cursor = next;
      } while (collected.length < need);

      const rows = collected.map(toChunkRow).sort(byChunkIndex).slice(opts.offset, opts.offset + opts.limit);

      // If scrolling ran out on its own, we've genuinely seen every chunk and
      // collected.length IS the total — no extra call needed. Otherwise we
      // stopped early because we already had enough for this page, so we don't
      // know the real total and must ask for it separately. Prefer client.count
      // over an unbounded scroll: this is one round trip, always, versus
      // scrolling a potentially huge document just to learn its size.
      const total = exhausted
        ? collected.length
        : (await client.count(collection, { filter: documentFilter(documentId) })).count;

      return { rows, total };
    },
  };
}
