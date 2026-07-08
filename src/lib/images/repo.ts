import { eq, inArray } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { images } from "@/lib/db/schema";

export interface ImageRecord {
  id: string;
  filename: string;
  caption: string;
  storageKey: string;
  contentType: string;
}

export interface ImageRepo {
  createImage(input: { filename: string; storageKey: string; contentType: string; uploadedBy?: string | null }): Promise<string>;
  setStatus(id: string, status: string, error?: string): Promise<void>;
  setCaption(id: string, caption: string): Promise<void>;
  getByIds(ids: string[]): Promise<ImageRecord[]>;
}

// Postgres image-metadata repo. Always Postgres, regardless of VECTOR_STORE.
export function createImageRepo(db = defaultDb): ImageRepo {
  return {
    async createImage(input) {
      const [row] = await db
        .insert(images)
        .values({ filename: input.filename, storageKey: input.storageKey, contentType: input.contentType, uploadedBy: input.uploadedBy ?? null })
        .returning({ id: images.id });
      return row.id;
    },
    async setStatus(id, status, error) {
      await db
        .update(images)
        .set({ status: status as "pending" | "processing" | "ready" | "error", error: error ?? null })
        .where(eq(images.id, id));
    },
    async setCaption(id, caption) {
      await db.update(images).set({ caption }).where(eq(images.id, id));
    },
    async getByIds(ids) {
      if (ids.length === 0) return [];
      return db
        .select({ id: images.id, filename: images.filename, caption: images.caption, storageKey: images.storageKey, contentType: images.contentType })
        .from(images)
        .where(inArray(images.id, ids));
    },
  };
}
