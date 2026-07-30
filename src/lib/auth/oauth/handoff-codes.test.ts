import { describe, it, expect, beforeEach } from "vitest";
import { HANDOFF_CODE_TTL_MS, createHandoffCode, deleteExpiredHandoffCodes, __resetHandoffPruneThrottle } from "./handoff-codes";

function fakeDb() {
  const inserted: Array<Record<string, unknown>> = [];
  const deletes: unknown[] = [];
  return {
    inserted,
    deletes,
    insert: () => ({ values: async (v: Record<string, unknown>) => { inserted.push(v); } }),
    delete: () => ({ where: async (w: unknown) => { deletes.push(w); } }),
  };
}
const asDb = (f: ReturnType<typeof fakeDb>) => f as unknown as never;

describe("createHandoffCode", () => {
  it("expires exactly sixty seconds out", async () => {
    const f = fakeDb();
    const now = 1_700_000_000_000;
    const code = await createHandoffCode("u1", { database: asDb(f), now: () => now, randomToken: () => "c-1" });
    expect(code).toBe("c-1");
    expect(f.inserted).toEqual([{ code: "c-1", userId: "u1", expiresAt: new Date(now + 60_000) }]);
    expect(HANDOFF_CODE_TTL_MS).toBe(60_000);
  });

  // This code travels in a URL. A guessable one would hand a stranger a session.
  it("defaults to a long random code", async () => {
    const f = fakeDb();
    await createHandoffCode("u1", { database: asDb(f) });
    await createHandoffCode("u1", { database: asDb(f) });
    const [a, b] = f.inserted.map((r) => r.code as string);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("deleteExpiredHandoffCodes", () => {
  beforeEach(() => { __resetHandoffPruneThrottle(); });

  it("sweeps once, then throttles for an hour", async () => {
    const f = fakeDb();
    const t0 = 1_700_000_000_000;
    await deleteExpiredHandoffCodes({ database: asDb(f), now: () => t0 });
    await deleteExpiredHandoffCodes({ database: asDb(f), now: () => t0 + 60_000 });
    expect(f.deletes).toHaveLength(1);
    await deleteExpiredHandoffCodes({ database: asDb(f), now: () => t0 + 3_600_001 });
    expect(f.deletes).toHaveLength(2);
  });
});
