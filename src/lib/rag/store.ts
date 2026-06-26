import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documents, chunks } from "@/lib/db/schema";
import type { IngestStore } from "./ingest";

// Drizzle-backed implementation of the ingestion store.
export function createDrizzleStore(): IngestStore {
  return {
    async createDocument(filename) {
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
