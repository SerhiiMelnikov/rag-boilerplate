import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import type { DocumentRepo } from "./types";

// Postgres document-metadata repo. Always Postgres, regardless of VECTOR_STORE.
export function createDocumentRepo(db = defaultDb): DocumentRepo {
  return {
    async createDocument(filename) {
      // Atomic find-or-create on the unique filename (ON CONFLICT touches the row
      // so RETURNING yields the existing id under concurrency — no duplicates).
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
  };
}
