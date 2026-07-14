import { describe, it, expect, vi } from "vitest";
import { createPgVectorStore } from "./store";

describe("pgvector store (DB-free branches)", () => {
  it("upsertChunks with an empty array does not touch the db", async () => {
    const db = { insert: vi.fn() };
    // Deliberate: these branches never actually touch the db (short-circuited
    // before any query), so the fake only needs the one method each test spies
    // on — `never` (not `any`) bridges it to the real `typeof defaultDb` param.
    await createPgVectorStore(db as never).upsertChunks([]);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("searchKeyword returns [] when the query has no usable tokens", async () => {
    const db = { select: vi.fn() };
    const out = await createPgVectorStore(db as never).searchKeyword("!  ?", [0.1], 10);
    expect(out).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("searchVector([] allowlist) short-circuits without touching the db", async () => {
    const db = { select: vi.fn() };
    const out = await createPgVectorStore(db as never).searchVector([0.1], 10, []);
    expect(out).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("searchKeyword([] allowlist) short-circuits without touching the db", async () => {
    const db = { select: vi.fn() };
    const out = await createPgVectorStore(db as never).searchKeyword("hello", [0.1], 10, []);
    expect(out).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });
});
