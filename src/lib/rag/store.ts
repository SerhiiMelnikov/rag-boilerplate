import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { documents, chunks } from "@/lib/db/schema";
import type { IngestStore } from "./ingest";

// Drizzle-backed implementation of the ingestion store.
// An optional db instance can be injected (used by integration tests to supply
// a connection to a real DB without relying on the module-level singleton).
export function createDrizzleStore(db = defaultDb): IngestStore {
  return {
    async createDocument(filename) {
      // Find-or-create: filename is the natural key for a document. If a row
      // with this filename already exists, return its id so that
      // existingHashes() can look up the prior run's chunk hashes and skip
      // re-embedding identical content. Only insert a new row when no matching
      // document is found.
      const existing = await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.filename, filename))
        .limit(1);
      if (existing.length > 0) {
        return existing[0].id;
      }
      const [row] = await db.insert(documents).values({ filename }).returning({ id: documents.id });
      return row.id;
    },
    async setStatus(id, status, error) {
      await db
        .update(documents)
        .set({ status: status as "pending" | "processing" | "ready" | "error", error: error ?? null })
        .where(eq(documents.id, id));
    },
    async existingHashes(documentId) {
      const rows = await db
        .select({ contentHash: chunks.contentHash })
        .from(chunks)
        .where(eq(chunks.documentId, documentId));
      return new Set(rows.map((r) => r.contentHash));
    },
    async insertChunks(rows) {
      if (rows.length === 0) return;
      await db.insert(chunks).values(rows);
    },
  };
}
