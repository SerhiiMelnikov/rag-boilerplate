import { desc, eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { getVectorStore } from "@/lib/vectorstore";
import type { VectorStore } from "@/lib/vectorstore/types";

export async function listDocuments(database = defaultDb) {
  return database
    .select({ id: documents.id, filename: documents.filename, status: documents.status, error: documents.error, createdAt: documents.createdAt })
    .from(documents)
    .orderBy(desc(documents.createdAt));
}

export async function deleteDocument(id: string, deps: { database?: typeof defaultDb; vectorStore?: VectorStore } = {}) {
  const database = deps.database ?? defaultDb;
  const vectorStore = deps.vectorStore ?? getVectorStore();
  // Remove vectors first so a store without FK cascade (Qdrant) stays consistent.
  // On pgvector this is a harmless no-op after the row delete cascades, but doing
  // it up front keeps both stores correct regardless of order.
  await vectorStore.deleteByDocument(id);
  const deleted = await database.delete(documents).where(eq(documents.id, id)).returning({ id: documents.id });
  return deleted.length > 0;
}
