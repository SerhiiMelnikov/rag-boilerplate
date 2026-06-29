import { desc, eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";

export async function listDocuments(database = defaultDb) {
  return database
    .select({ id: documents.id, filename: documents.filename, status: documents.status, error: documents.error, createdAt: documents.createdAt })
    .from(documents)
    .orderBy(desc(documents.createdAt));
}

export async function deleteDocument(id: string, database = defaultDb) {
  const deleted = await database.delete(documents).where(eq(documents.id, id)).returning({ id: documents.id });
  return deleted.length > 0;
}
