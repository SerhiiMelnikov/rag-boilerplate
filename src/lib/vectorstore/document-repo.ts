import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import type { DocumentRepo } from "./types";

// Postgres document-metadata repo. Always Postgres, regardless of VECTOR_STORE.
export function createDocumentRepo(db = defaultDb): DocumentRepo {
  return {
    async createDocument(filename) {
      // Insert if new; ON CONFLICT DO NOTHING means a colliding insert returns no
      // row instead of touching the existing one. Fall back to a select for the
      // existing id. Both racing callers converge on the same id (the unique
      // constraint on filename guarantees only one insert wins), so there are
      // still no duplicates — but callers can now tell new from existing, which
      // matters for one-time-only side effects like default workspace assignment.
      const [inserted] = await db
        .insert(documents)
        .values({ filename })
        .onConflictDoNothing({ target: documents.filename })
        .returning({ id: documents.id });
      if (inserted) return { id: inserted.id, created: true };
      const [existing] = await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.filename, filename))
        .limit(1);
      return { id: existing.id, created: false };
    },
    async setStatus(id, status, error) {
      await db
        .update(documents)
        .set({ status: status as "pending" | "processing" | "ready" | "error", error: error ?? null })
        .where(eq(documents.id, id));
    },
  };
}
