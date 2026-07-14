import { describe, it, expect, vi } from "vitest";
import { setUserRole, setUserBlocked, SuperAdminProtectedError, SelfActionError } from "./user-admin";

// Fake db: getAuthUserById-style read of the target, then an update spy.
// Returns { db, set } rather than stashing the spy on the db object itself, so
// callers get a properly typed handle instead of casting the db back to read it.
function fakeDb(target: { isSuperAdmin: boolean }) {
  const set = vi.fn(() => ({ where: async () => {} }));
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "t1", role: "user", isSuperAdmin: target.isSuperAdmin, blockedAt: null }] }) }) }),
    update: () => ({ set }),
  };
  // Deliberate: this fake only implements the two Drizzle calls setUserRole/setUserBlocked
  // actually make, not the full `typeof defaultDb` surface — `never` (not `any`) bridges it.
  return { db: db as never, set };
}

describe("user-admin safeguards", () => {
  it("refuses to change the super-admin's role", async () => {
    await expect(setUserRole("t1", "user", "actor", fakeDb({ isSuperAdmin: true }).db)).rejects.toBeInstanceOf(SuperAdminProtectedError);
  });
  it("refuses to block the super-admin", async () => {
    await expect(setUserBlocked("t1", true, "actor", fakeDb({ isSuperAdmin: true }).db)).rejects.toBeInstanceOf(SuperAdminProtectedError);
  });
  it("refuses to act on your own account", async () => {
    await expect(setUserRole("t1", "admin", "t1", fakeDb({ isSuperAdmin: false }).db)).rejects.toBeInstanceOf(SelfActionError);
    await expect(setUserBlocked("t1", true, "t1", fakeDb({ isSuperAdmin: false }).db)).rejects.toBeInstanceOf(SelfActionError);
  });
  it("updates role for a normal target", async () => {
    const { db, set } = fakeDb({ isSuperAdmin: false });
    await setUserRole("t1", "admin", "actor", db);
    expect(set).toHaveBeenCalledWith({ role: "admin" });
  });
  it("blocks a normal target with a timestamp and unblocks with null", async () => {
    const { db: db1, set: set1 } = fakeDb({ isSuperAdmin: false });
    await setUserBlocked("t1", true, "actor", db1);
    expect(set1).toHaveBeenCalledWith(expect.objectContaining({ blockedAt: expect.any(Date) }));
    const { db: db2, set: set2 } = fakeDb({ isSuperAdmin: false });
    await setUserBlocked("t1", false, "actor", db2);
    expect(set2).toHaveBeenCalledWith({ blockedAt: null });
  });
});
