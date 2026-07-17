import { describe, it, expect } from "vitest";
import { Column, Param } from "drizzle-orm";
import { createVerificationToken, consumeVerificationToken, isVerificationTokenValid } from "./verification";

// The fake below models `where` clauses the way real drizzle `eq`/`and`/`isNull`
// actually build them (an `SQL` object holding `queryChunks`), not as a plain
// object like `{ _token: "..." }`. That matters here specifically because
// consumeVerificationToken's decisive WHERE is a composite
// `and(eq(users.id, x), isNull(users.emailVerifiedAt))` — a fake that only
// inspected the `id` half would let the IS NULL scope silently vanish from the
// production code without any test noticing (see the "already-verified" test
// below, which is written to catch exactly that).
//
// `Column` and `Param` are drizzle-orm's own public classes (exported from the
// package index, with a public `name`/`value`), not private internals, so the
// fake can safely walk a WHERE tree and assert on the real column names it
// filters on.
type Condition = { column: string; kind: "eq"; value: string } | { column: string; kind: "isNull" };

function extractConditions(node: unknown): Condition[] {
  const n = node as { queryChunks?: unknown[] } | undefined;
  if (!n?.queryChunks) return [];
  const col = n.queryChunks.find((c): c is InstanceType<typeof Column> => c instanceof Column);
  if (col) {
    const param = n.queryChunks.find((c): c is InstanceType<typeof Param> => c instanceof Param);
    if (param) return [{ column: col.name, kind: "eq", value: String(param.value) }];
    return [{ column: col.name, kind: "isNull" }];
  }
  // Not a leaf condition (e.g. the "(" ... "and" ... ")" wrapper `and()` builds):
  // recurse into any nested SQL fragments.
  return n.queryChunks.flatMap((c) => (c && typeof c === "object" ? extractConditions(c) : []));
}

function findEq(conditions: Condition[], column: string): string {
  const hit = conditions.find((c): c is Extract<Condition, { kind: "eq" }> => c.column === column && c.kind === "eq");
  if (!hit) throw new Error(`fake db: expected an eq() filter on column "${column}", found none`);
  return hit.value;
}

// Fake db modelling the tokens table + the users row a token verifies. The
// `usersTable` map is genuinely mutated by `update(...).where(...)` only when
// the extracted WHERE conditions actually match the row's current state — so a
// production bug that drops the `IS NULL` scope (or filters the wrong column)
// changes what this fake allows through, not just what it records.
function fakeDb() {
  const tokens = new Map<string, { userId: string; expiresAt: Date }>();
  const usersTable = new Map<string, { passwordHash: string; emailVerifiedAt: Date | null }>();
  const updates: { userId: string; passwordHash: string; emailVerifiedAt: Date }[] = [];

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
            const token = findEq(extractConditions(w), "token");
            const row = tokens.get(token);
            return row ? [{ token, userId: row.userId, expiresAt: row.expiresAt }] : [];
          },
        }),
      }),
    }),
    update: () => ({
      set: (payload: { passwordHash: string; emailVerifiedAt: Date }) => ({
        where: (w: unknown) => ({
          returning: async () => {
            const conditions = extractConditions(w);
            const userId = findEq(conditions, "id");
            const row = usersTable.get(userId);
            if (!row) return [];
            const matches = conditions.every((c) => {
              if (c.column === "id") return c.kind === "eq" && c.value === userId;
              if (c.column === "email_verified_at") {
                if (c.kind !== "isNull") throw new Error("fake db: expected an isNull() filter on email_verified_at");
                return row.emailVerifiedAt === null;
              }
              throw new Error(`fake db: unexpected column in users WHERE: "${c.column}"`);
            });
            if (!matches) return [];
            row.passwordHash = payload.passwordHash;
            row.emailVerifiedAt = payload.emailVerifiedAt;
            updates.push({ userId, passwordHash: payload.passwordHash, emailVerifiedAt: payload.emailVerifiedAt });
            return [{ id: userId }];
          },
        }),
      }),
    }),
    delete: () => ({
      where: async (w: unknown) => {
        const conditions = extractConditions(w);
        const tokenCond = conditions.find((c) => c.column === "token");
        if (tokenCond && tokenCond.kind === "eq") {
          tokens.delete(tokenCond.value);
          return;
        }
        const userCond = conditions.find((c) => c.column === "user_id");
        if (userCond && userCond.kind === "eq") {
          for (const [t, v] of tokens) if (v.userId === userCond.value) tokens.delete(t);
          return;
        }
        throw new Error("fake db: delete(email_verification_tokens) with an unrecognized WHERE");
      },
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  } as never;
  return { db, tokens, usersTable, updates };
}

const NOW = 1_800_000_000_000;

describe("createVerificationToken", () => {
  it("issues a token bound to the user, carrying no password", async () => {
    const { db, tokens } = fakeDb();
    const t = await createVerificationToken("u1", { database: db, now: () => NOW, randomToken: () => "tok" });
    expect(t).toBe("tok");
    expect(tokens.get("tok")).toEqual({ userId: "u1", expiresAt: new Date(NOW + 24 * 60 * 60 * 1000) });
  });

  it("expires the token 24 hours out", async () => {
    const { db, tokens } = fakeDb();
    await createVerificationToken("u1", { database: db, now: () => NOW, randomToken: () => "tok" });
    expect(tokens.get("tok")?.expiresAt.getTime()).toBe(NOW + 24 * 60 * 60 * 1000);
  });

  it("issues unpredictable tokens by default", async () => {
    const { db } = fakeDb();
    const a = await createVerificationToken("u1", { database: db, now: () => NOW });
    const b = await createVerificationToken("u2", { database: db, now: () => NOW });
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});

describe("isVerificationTokenValid", () => {
  it("is true for a live token", async () => {
    const { db } = fakeDb();
    await createVerificationToken("u1", { database: db, now: () => NOW, randomToken: () => "tok" });
    expect(await isVerificationTokenValid("tok", { database: db, now: () => NOW })).toBe(true);
  });

  it("is false for an unknown token", async () => {
    const { db } = fakeDb();
    expect(await isVerificationTokenValid("nope", { database: db, now: () => NOW })).toBe(false);
  });

  it("is false for an expired token", async () => {
    const { db } = fakeDb();
    await createVerificationToken("u1", { database: db, now: () => NOW, randomToken: () => "tok" });
    const later = NOW + 24 * 60 * 60 * 1000 + 1;
    expect(await isVerificationTokenValid("tok", { database: db, now: () => later })).toBe(false);
  });

  // The load-bearing property: a prefetcher (Outlook Safe Links, a corporate mail
  // scanner) GETs the link with no human involved. Checking validity must never
  // consume the token — it must still be there, and still consumable, afterward.
  it("does not consume the token — GET, then the token still works", async () => {
    const { db, tokens, usersTable } = fakeDb();
    usersTable.set("u1", { passwordHash: "placeholder", emailVerifiedAt: null });
    const t = await createVerificationToken("u1", { database: db, now: () => NOW, randomToken: () => "tok" });

    expect(await isVerificationTokenValid(t, { database: db, now: () => NOW })).toBe(true);
    expect(tokens.has(t)).toBe(true); // still present — the GET did not delete it

    // And it still actually works afterward: the "GET is harmless" property made
    // concrete, not just inferred from the token still being in the map.
    expect(await consumeVerificationToken(t, "chosen-hash", { database: db, now: () => NOW })).toBe(true);
  });
});

describe("consumeVerificationToken", () => {
  function seed(db: ReturnType<typeof fakeDb>["db"], usersTable: ReturnType<typeof fakeDb>["usersTable"], userId: string, emailVerifiedAt: Date | null = null) {
    usersTable.set(userId, { passwordHash: "placeholder", emailVerifiedAt });
    return db;
  }

  it("sets the chosen password, marks the address verified, and returns true", async () => {
    const { db, usersTable, updates } = fakeDb();
    seed(db, usersTable, "u1");
    await createVerificationToken("u1", { database: db, now: () => NOW, randomToken: () => "tok" });

    expect(await consumeVerificationToken("tok", "chosen-hash", { database: db, now: () => NOW })).toBe(true);
    expect(updates).toEqual([{ userId: "u1", passwordHash: "chosen-hash", emailVerifiedAt: new Date(NOW) }]);
    expect(usersTable.get("u1")).toEqual({ passwordHash: "chosen-hash", emailVerifiedAt: new Date(NOW) });
  });

  // The deciding test: a link forwarded or replayed must not work twice.
  it("cannot be consumed twice", async () => {
    const { db, usersTable } = fakeDb();
    seed(db, usersTable, "u1");
    await createVerificationToken("u1", { database: db, now: () => NOW, randomToken: () => "tok" });

    expect(await consumeVerificationToken("tok", "first-hash", { database: db, now: () => NOW })).toBe(true);
    expect(await consumeVerificationToken("tok", "second-hash", { database: db, now: () => NOW })).toBe(false);
    // The second attempt must not have clobbered the first, already-successful one.
    expect(usersTable.get("u1")?.passwordHash).toBe("first-hash");
  });

  it("refuses an expired token and changes nothing", async () => {
    const { db, usersTable, updates } = fakeDb();
    seed(db, usersTable, "u1");
    await createVerificationToken("u1", { database: db, now: () => NOW, randomToken: () => "tok" });
    const later = NOW + 24 * 60 * 60 * 1000 + 1;

    expect(await consumeVerificationToken("tok", "hash", { database: db, now: () => later })).toBe(false);
    expect(updates).toEqual([]);
  });

  it("refuses an unknown token", async () => {
    const { db } = fakeDb();
    expect(await consumeVerificationToken("nope", "hash", { database: db, now: () => NOW })).toBe(false);
  });

  // Consuming any one token disarms ALL of this user's outstanding tokens, not
  // just the one that was clicked — so anything still sitting in flight (e.g. a
  // link minted by someone re-registering the same address) is dead the instant
  // verification succeeds.
  it("deletes ALL of the user's tokens on success, not just the one consumed", async () => {
    const { db, usersTable, tokens } = fakeDb();
    seed(db, usersTable, "u1");
    const t1 = await createVerificationToken("u1", { database: db, now: () => NOW, randomToken: () => "T1" });
    const t2 = await createVerificationToken("u1", { database: db, now: () => NOW, randomToken: () => "T2" });

    expect(await consumeVerificationToken(t1, "hash", { database: db, now: () => NOW })).toBe(true);
    expect(tokens.has(t1)).toBe(false);
    expect(tokens.has(t2)).toBe(false); // the OTHER token is gone too
  });

  // The review finding, made non-vacuous: a leftover token for a user who is
  // ALREADY verified must not be able to re-set the password. To confirm this
  // test actually exercises the IS NULL scope (and is not just vacuously true),
  // temporarily remove `isNull(users.emailVerifiedAt)` from the WHERE in
  // consumeVerificationToken and re-run this file — this test must fail.
  it("a token for an already-verified user returns false and does not change the password", async () => {
    const { db, usersTable, updates } = fakeDb();
    const alreadyVerifiedAt = new Date(NOW - 1000);
    seed(db, usersTable, "u1", alreadyVerifiedAt);
    usersTable.get("u1")!.passwordHash = "real-password-hash";
    // A token still exists for this already-verified user (e.g. a stray/late
    // token from before verification completed via a different one).
    const t = await createVerificationToken("u1", { database: db, now: () => NOW, randomToken: () => "tok" });

    expect(await consumeVerificationToken(t, "attacker-or-stale-hash", { database: db, now: () => NOW })).toBe(false);
    expect(usersTable.get("u1")).toEqual({ passwordHash: "real-password-hash", emailVerifiedAt: alreadyVerifiedAt });
    expect(updates).toEqual([]);
  });
});

// CRITICAL: the account-takeover vector this whole design exists to close.
// Two earlier designs each carried the password in the registration/token
// request and were proven exploitable against a real database (see the design
// doc's "Why the password cannot travel with the registration"). This flow
// removes the vector structurally: nothing ever sets a password except
// consumeVerificationToken, and it is only ever called with the password the
// CLICKER just typed into the form. An "attacker" who re-registers someone
// else's address never receives any token (both land in the real owner's
// inbox), so they never have anything to call consumeVerificationToken with.
describe("the account-takeover attack fails: whoever clicks sets the password, and only that", () => {
  it("the attacker's password never works, because the attacker never had a token to set one with", async () => {
    const { db, usersTable } = fakeDb();
    usersTable.set("victim-id", { passwordHash: "placeholder", emailVerifiedAt: null });

    // 1. Victim registers: token T1 minted. It carries no password — nobody's
    //    password is decided at this point.
    const t1 = await createVerificationToken("victim-id", { database: db, now: () => NOW, randomToken: () => "T1" });

    // 2. Attacker re-registers the same address — exactly what registerUser's
    //    "unverified -> resend" branch does. This mints T2, but the attacker
    //    never receives EITHER T1 or T2: both are emailed to the victim's own
    //    inbox, which the attacker does not control.
    const t2 = await createVerificationToken("victim-id", { database: db, now: () => NOW, randomToken: () => "T2" });
    expect(usersTable.get("victim-id")?.emailVerifiedAt).toBeNull(); // re-registering touched nothing

    // 3. The victim clicks A link — it does not matter which of the two live
    //    tokens they pick, say the newer one (the natural thing to click) — and
    //    types THEIR OWN password into the form.
    const victimChosenHash = "hash(victims-own-password)";
    expect(await consumeVerificationToken(t2, victimChosenHash, { database: db, now: () => NOW })).toBe(true);
    expect(usersTable.get("victim-id")?.passwordHash).toBe(victimChosenHash);

    // 4. The attacker has no password to fall back on. They hold no token of
    //    their own to submit, and the one they might have guessed or intercepted
    //    (T1) was disarmed the instant the victim verified — consuming ANY token
    //    deletes ALL of this user's tokens.
    expect(await consumeVerificationToken(t1, "attacker-chosen-hash", { database: db, now: () => NOW })).toBe(false);
    expect(usersTable.get("victim-id")?.passwordHash).toBe(victimChosenHash); // unchanged: the attacker's password never took effect
  });
});
