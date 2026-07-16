import { describe, it, expect } from "vitest";
import { Param } from "drizzle-orm";
import { createVerificationToken, consumeVerificationToken } from "./verification";

// The brief's fake models `where` as a plain object like `{ _token: "..." }`, but
// a real `eq(...)` builds a drizzle `SQL` object (a `queryChunks` array holding the
// column and a `Param` wrapping the literal). We don't need to know which column is
// being compared — each call site here only ever compares on one thing (token for
// select/delete, user id for update) — so pulling the `Param`'s value out is enough
// to drive the fake correctly regardless of query shape.
function paramValue(where: unknown): string {
  const chunks = (where as { queryChunks: unknown[] }).queryChunks;
  const param = chunks.find((c): c is InstanceType<typeof Param> => c instanceof Param);
  if (!param) throw new Error("fake db: no Param found in where clause");
  return String(param.value);
}

// Fake db modelling one tokens table + the users row it verifies.
function fakeDb() {
  const tokens = new Map<string, { userId: string; expiresAt: Date }>();
  const verified: string[] = [];
  const db = {
    insert: () => ({
      values: async (v: { token: string; userId: string; expiresAt: Date }) => {
        tokens.set(v.token, { userId: v.userId, expiresAt: v.expiresAt });
      },
    }),
    select: () => ({
      from: () => ({
        where: (w: unknown) => ({
          limit: async () => {
            const token = paramValue(w);
            const row = tokens.get(token);
            return row ? [{ token, userId: row.userId, expiresAt: row.expiresAt }] : [];
          },
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: async (w: unknown) => {
          verified.push(paramValue(w));
        },
      }),
    }),
    delete: () => ({
      where: async (w: unknown) => {
        tokens.delete(paramValue(w));
      },
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  } as never;
  return { db, tokens, verified };
}

const NOW = 1_800_000_000_000;

describe("verification tokens", () => {
  it("issues a token bound to the user", async () => {
    const { db, tokens } = fakeDb();
    const t = await createVerificationToken("u1", { database: db, now: () => NOW, randomToken: () => "tok" });
    expect(t).toBe("tok");
    expect(tokens.get("tok")?.userId).toBe("u1");
  });

  it("expires the token 24 hours out", async () => {
    const { db, tokens } = fakeDb();
    await createVerificationToken("u1", { database: db, now: () => NOW, randomToken: () => "tok" });
    expect(tokens.get("tok")?.expiresAt.getTime()).toBe(NOW + 24 * 60 * 60 * 1000);
  });

  it("verifies the user and returns true", async () => {
    const { db, verified } = fakeDb();
    await createVerificationToken("u1", { database: db, now: () => NOW, randomToken: () => "tok" });
    expect(await consumeVerificationToken("tok", { database: db, now: () => NOW })).toBe(true);
    expect(verified).toEqual(["u1"]);
  });

  // The deciding test: a link forwarded or replayed must not work twice.
  it("cannot be consumed twice", async () => {
    const { db } = fakeDb();
    await createVerificationToken("u1", { database: db, now: () => NOW, randomToken: () => "tok" });
    expect(await consumeVerificationToken("tok", { database: db, now: () => NOW })).toBe(true);
    expect(await consumeVerificationToken("tok", { database: db, now: () => NOW })).toBe(false);
  });

  it("refuses an expired token and verifies nobody", async () => {
    const { db, verified } = fakeDb();
    await createVerificationToken("u1", { database: db, now: () => NOW, randomToken: () => "tok" });
    const later = NOW + 24 * 60 * 60 * 1000 + 1;
    expect(await consumeVerificationToken("tok", { database: db, now: () => later })).toBe(false);
    expect(verified).toEqual([]);
  });

  it("refuses an unknown token", async () => {
    const { db } = fakeDb();
    expect(await consumeVerificationToken("nope", { database: db, now: () => NOW })).toBe(false);
  });

  it("issues unpredictable tokens by default", async () => {
    const { db } = fakeDb();
    const a = await createVerificationToken("u1", { database: db, now: () => NOW });
    const b = await createVerificationToken("u2", { database: db, now: () => NOW });
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});
