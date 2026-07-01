import { sql, cosineDistance, gt, desc, eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { chunks, documents } from "@/lib/db/schema";
import type { VectorStore, ChunkInput, RetrievedChunk } from "../types";

// pgvector-backed store. Chunks live in Postgres; filename comes from the
// documents join (ChunkInput.filename is unused on write here).
export function createPgVectorStore(db = defaultDb): VectorStore {
  const cosine = (embedding: number[]) => sql<number>`1 - (${cosineDistance(chunks.embedding, embedding)})`;

  return {
    async upsertChunks(rows: ChunkInput[]) {
      if (rows.length === 0) return;
      await db.insert(chunks).values(
        rows.map((r) => ({ documentId: r.documentId, content: r.content, embedding: r.embedding, contentHash: r.contentHash })),
      );
    },

    async existingHashes(documentId: string) {
      const rows = await db
        .select({ contentHash: chunks.contentHash })
        .from(chunks)
        .where(eq(chunks.documentId, documentId));
      return new Set(rows.map((r) => r.contentHash));
    },

    async deleteByDocument(documentId: string) {
      await db.delete(chunks).where(eq(chunks.documentId, documentId));
    },

    async searchVector(embedding: number[], limit: number): Promise<RetrievedChunk[]> {
      const similarity = cosine(embedding);
      return db
        .select({ chunkId: chunks.id, documentId: chunks.documentId, filename: documents.filename, content: chunks.content, score: similarity })
        .from(chunks)
        .innerJoin(documents, eq(documents.id, chunks.documentId))
        .where(gt(similarity, 0))
        .orderBy((t) => desc(t.score))
        .limit(limit);
    },

    async searchKeyword(query: string, embedding: number[], limit: number): Promise<RetrievedChunk[]> {
      const tokens = [...new Set((query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length >= 2))];
      if (tokens.length === 0) return [];
      const tsq = tokens.map((t) => `${t}:*`).join(" | ");
      const tsv = sql`to_tsvector('simple', ${chunks.content})`;
      const tsquery = sql`to_tsquery('simple', ${tsq})`;
      const similarity = cosine(embedding);
      return db
        .select({ chunkId: chunks.id, documentId: chunks.documentId, filename: documents.filename, content: chunks.content, score: similarity })
        .from(chunks)
        .innerJoin(documents, eq(documents.id, chunks.documentId))
        .where(sql`${tsv} @@ ${tsquery}`)
        .orderBy(sql`ts_rank(${tsv}, ${tsquery}) desc`)
        .limit(limit);
    },
  };
}
