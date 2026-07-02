import { describe, it, expect, vi } from "vitest";
import { setUserRole, setUserBlocked, SuperAdminProtectedError, SelfActionError } from "./user-admin";

// Fake db: getAuthUserById-style read of the target, then an update spy.
function fakeDb(target: { isSuperAdmin: boolean }) {
  const set = vi.fn(() => ({ where: async () => {} }));
  return {
    _set: set,
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "t1", role: "user", isSuperAdmin: target.isSuperAdmin, blockedAt: null }] }) }) }),
    update: () => ({ set }),
  } as any;
}

describe("user-admin safeguards", () => {
  it("refuses to change the super-admin's role", async () => {
    await expect(setUserRole("t1", "user", "actor", fakeDb({ isSuperAdmin: true }))).rejects.toBeInstanceOf(SuperAdminProtectedError);
  });
  it("refuses to block the super-admin", async () => {
    await expect(setUserBlocked("t1", true, "actor", fakeDb({ isSuperAdmin: true }))).rejects.toBeInstanceOf(SuperAdminProtectedError);
  });
  it("refuses to act on your own account", async () => {
    await expect(setUserRole("t1", "admin", "t1", fakeDb({ isSuperAdmin: false }))).rejects.toBeInstanceOf(SelfActionError);
    await expect(setUserBlocked("t1", true, "t1", fakeDb({ isSuperAdmin: false }))).rejects.toBeInstanceOf(SelfActionError);
  });
  it("updates role for a normal target", async () => {
    const db = fakeDb({ isSuperAdmin: false });
    await setUserRole("t1", "admin", "actor", db);
    expect(db._set).toHaveBeenCalledWith({ role: "admin" });
  });
  it("blocks a normal target with a timestamp and unblocks with null", async () => {
    const db1 = fakeDb({ isSuperAdmin: false });
    await setUserBlocked("t1", true, "actor", db1);
    expect(db1._set).toHaveBeenCalledWith(expect.objectContaining({ blockedAt: expect.any(Date) }));
    const db2 = fakeDb({ isSuperAdmin: false });
    await setUserBlocked("t1", false, "actor", db2);
    expect(db2._set).toHaveBeenCalledWith({ blockedAt: null });
  });
});
