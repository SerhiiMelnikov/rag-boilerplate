import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth/guards", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/guards");
  return { ...actual, requireSuperAdmin: vi.fn() };
});
vi.mock("@/lib/auth/user-admin", () => ({ setUserRole: vi.fn(), setUserBlocked: vi.fn(), SuperAdminProtectedError: class extends Error {}, SelfActionError: class extends Error {}, UserNotFoundError: class extends Error {} }));
import { PATCH } from "@/app/api/admin/users/[id]/route";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { setUserRole, setUserBlocked, SuperAdminProtectedError } from "@/lib/auth/user-admin";
beforeEach(() => vi.clearAllMocks());

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body: unknown) => new Request("http://localhost/api/admin/users/t1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

it("changes role", async () => {
  (requireSuperAdmin as any).mockResolvedValue({ id: "s", isSuperAdmin: true });
  const res = await PATCH(req({ role: "admin" }), ctx("t1"));
  expect(res.status).toBe(200);
  expect(setUserRole).toHaveBeenCalledWith("t1", "admin", "s", undefined);
});
it("blocks a user", async () => {
  (requireSuperAdmin as any).mockResolvedValue({ id: "s", isSuperAdmin: true });
  const res = await PATCH(req({ blocked: true }), ctx("t1"));
  expect(res.status).toBe(200);
  expect(setUserBlocked).toHaveBeenCalledWith("t1", true, "s", undefined);
});
it("400 on an invalid body (neither role nor blocked)", async () => {
  (requireSuperAdmin as any).mockResolvedValue({ id: "s", isSuperAdmin: true });
  expect((await PATCH(req({}), ctx("t1"))).status).toBe(400);
});
it("403 when the service raises a safeguard error", async () => {
  (requireSuperAdmin as any).mockResolvedValue({ id: "s", isSuperAdmin: true });
  (setUserRole as any).mockRejectedValue(new SuperAdminProtectedError());
  expect((await PATCH(req({ role: "user" }), ctx("t1"))).status).toBe(403);
});
