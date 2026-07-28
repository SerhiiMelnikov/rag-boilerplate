import { describe, it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { createPgVectorStore } from "./store";

// Renders a drizzle SQL fragment to plain text (its objects are circular, so
// JSON.stringify/String() don't work) to assert on the ORDER BY clause below.
const dialect = new PgDialect();
const renderSql = (fragment: unknown) => dialect.sqlToQuery(fragment as Parameters<PgDialect["sqlToQuery"]>[0]).sql;

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

  it("listChunks orders by chunk_index nulls last, honours limit/offset, and returns the document's full count as total (not the page length)", async () => {
    const rows = [
      { chunkIndex: 2, content: "c2", contentHash: "h2" },
      { chunkIndex: null, content: "c-null", contentHash: "h-null" },
    ];
    const offset = vi.fn(async (_n: number) => rows);
    const limit = vi.fn((_n: number) => ({ offset }));
    const orderBy = vi.fn((_clause: unknown) => ({ limit }));
    // Deliberate: real Drizzle query builders are themselves thenable at every
    // step (you can `await` right after `.where()`, or keep chaining first) —
    // this fake's `where()` result mimics that by being BOTH a resolved promise
    // (serving the `count(*)` query, which stops at `.where()`) AND further
    // chainable via `.orderBy()` (serving the row query), so one fake serves
    // both `db.select()` calls regardless of which happens first.
    const db = {
      select: () => ({ from: () => ({ where: () => Object.assign(Promise.resolve([{ total: 7 }]), { orderBy }) }) }),
    };
    const out = await createPgVectorStore(db as never).listChunks("d1", { limit: 2, offset: 4 });
    expect(out).toEqual({ rows, total: 7 });
    expect(renderSql(orderBy.mock.calls[0][0])).toMatch(/chunk_index.*asc.*nulls last/i);
    expect(limit).toHaveBeenCalledWith(2);
    expect(offset).toHaveBeenCalledWith(4);
  });
});
