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
      // Atomic find-or-create keyed on the unique filename. ON CONFLICT touches the
      // row so RETURNING yields the existing id under concurrency (no duplicates).
      const [row] = await db
        .insert(documents)
        .values({ filename })
        .onConflictDoUpdate({ target: documents.filename, set: { filename } })
        .returning({ id: documents.id });
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
