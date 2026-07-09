import { describe, it, expect, vi } from "vitest";
import { createPgVectorStore } from "./store";

describe("pgvector store (DB-free branches)", () => {
  it("upsertChunks with an empty array does not touch the db", async () => {
    const db = { insert: vi.fn() } as any;
    await createPgVectorStore(db).upsertChunks([]);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("searchKeyword returns [] when the query has no usable tokens", async () => {
    const db = { select: vi.fn() } as any;
    const out = await createPgVectorStore(db).searchKeyword("!  ?", [0.1], 10);
    expect(out).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("searchVector([] allowlist) short-circuits without touching the db", async () => {
    const db = { select: vi.fn() } as any;
    const out = await createPgVectorStore(db).searchVector([0.1], 10, []);
    expect(out).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("searchKeyword([] allowlist) short-circuits without touching the db", async () => {
    const db = { select: vi.fn() } as any;
    const out = await createPgVectorStore(db).searchKeyword("hello", [0.1], 10, []);
    expect(out).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });
});
