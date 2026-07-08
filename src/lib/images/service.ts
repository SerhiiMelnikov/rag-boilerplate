import { desc, eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { images } from "@/lib/db/schema";
import { getObjectStore, type ObjectStore } from "./storage";
import { getImageVectorStore } from "@/lib/vectorstore";
import type { ImageVectorStore } from "@/lib/vectorstore/types";
import { createImageRepo, type ImageRepo } from "./repo";

export async function listImages(database = defaultDb) {
  return database
    .select({ id: images.id, filename: images.filename, status: images.status, error: images.error, createdAt: images.createdAt })
    .from(images)
    .orderBy(desc(images.createdAt));
}

export interface DeleteImageDeps {
  database?: typeof defaultDb;
  objectStore?: ObjectStore;
  imageVectorStore?: ImageVectorStore;
  imageRepo?: ImageRepo;
}

// Remove an image everywhere: its vector (chosen store), its S3 object, then the
// Postgres row. Vector-first so a store without FK cascade stays consistent.
export async function deleteImage(id: string, deps: DeleteImageDeps = {}): Promise<boolean> {
  const database = deps.database ?? defaultDb;
  const objectStore = deps.objectStore ?? getObjectStore();
  const imageVectorStore = deps.imageVectorStore ?? getImageVectorStore();
  const imageRepo = deps.imageRepo ?? createImageRepo();

  const [record] = await imageRepo.getByIds([id]);
  if (!record) return false;

  await imageVectorStore.deleteImage(id);
  await objectStore.delete(record.storageKey);
  const deleted = await database.delete(images).where(eq(images.id, id)).returning({ id: images.id });
  return deleted.length > 0;
}
