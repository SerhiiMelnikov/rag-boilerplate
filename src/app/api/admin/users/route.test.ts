import { it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth/guards", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/guards")>("@/lib/auth/guards");
  return { ...actual, requireSuperAdmin: vi.fn() };
});
vi.mock("@/lib/auth/user-admin", () => ({ listUsers: vi.fn() }));
import { GET } from "@/app/api/admin/users/route";
import { requireSuperAdmin, ForbiddenError } from "@/lib/auth/guards";
import { listUsers } from "@/lib/auth/user-admin";
beforeEach(() => vi.clearAllMocks());

it("403 for non-super-admin", async () => {
  vi.mocked(requireSuperAdmin).mockRejectedValue(new ForbiddenError());
  expect((await GET()).status).toBe(403);
});
it("lists users for the super-admin", async () => {
  vi.mocked(requireSuperAdmin).mockResolvedValue({ id: "s", role: "admin", isSuperAdmin: true });
  vi.mocked(listUsers).mockResolvedValue([{ id: "u1", email: "e", role: "user", isSuperAdmin: false, blockedAt: null, createdAt: new Date(0) }]);
  const res = await GET();
  expect(res.status).toBe(200);
  expect((await res.json()).users).toHaveLength(1);
});
