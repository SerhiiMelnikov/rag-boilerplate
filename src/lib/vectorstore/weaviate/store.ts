import type { VectorStore, ChunkInput, RetrievedChunk } from "../types";
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
    fetchObjects(args: { filters?: unknown; returnProperties?: string[]; limit?: number }): Promise<{ objects: WeaviateObject[] }>;
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
          properties: { documentId: r.documentId, filename: r.filename, content: r.content, contentHash: r.contentHash },
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
  };
}
