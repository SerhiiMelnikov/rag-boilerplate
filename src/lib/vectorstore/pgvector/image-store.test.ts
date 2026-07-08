import { describe, it, expect, vi } from "vitest";
import { createPgImageStore } from "./image-store";

// Mirrors the real drizzle chain used by createPgImageStore:
// db.insert(...).values(...).onConflictDoUpdate(...) and db.delete(...).where(...).
// `values` records the row and returns the next link in the chain rather than
// resolving immediately, so `.onConflictDoUpdate(...)` stays callable.
function fakeDb() {
  const calls: Record<string, unknown[]> = { insert: [], delete: [] };
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn((v: unknown) => {
        calls.insert.push(v);
        return { onConflictDoUpdate: vi.fn(async () => {}) };
      }),
    })),
    delete: vi.fn(() => ({ where: vi.fn(async (w: unknown) => { calls.delete.push(w); }) })),
  };
  return { db, calls };
}

describe("createPgImageStore", () => {
  it("upsertImage inserts the imageId + embedding", async () => {
    const { db, calls } = fakeDb();
    // @ts-expect-error minimal fake db
    const store = createPgImageStore(db);
    await store.upsertImage({ imageId: "img-1", embedding: [0.1, 0.2] });
    expect(db.insert).toHaveBeenCalledOnce();
    expect(calls.insert[0]).toMatchObject({ imageId: "img-1", embedding: [0.1, 0.2] });
  });

  it("deleteImage deletes by imageId", async () => {
    const { db, calls } = fakeDb();
    // @ts-expect-error minimal fake db
    const store = createPgImageStore(db);
    await store.deleteImage("img-1");
    expect(db.delete).toHaveBeenCalledOnce();
    expect(calls.delete).toHaveLength(1);
  });
});
