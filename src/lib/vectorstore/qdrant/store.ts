import { randomUUID } from "node:crypto";
import type { QdrantClient } from "@qdrant/js-client-rest";
import type { VectorStore, ChunkInput, RetrievedChunk } from "../types";
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
          payload: { documentId: r.documentId, content: r.content, contentHash: r.contentHash, filename: r.filename },
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
  };
}
