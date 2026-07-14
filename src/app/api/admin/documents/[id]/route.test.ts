import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth/guards", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/guards")>("@/lib/auth/guards");
  return { ...actual, requireAdmin: vi.fn() };
});
vi.mock("@/lib/documents/service", () => ({ deleteDocument: vi.fn() }));
import { DELETE } from "@/app/api/admin/documents/[id]/route";
import { requireAdmin, ForbiddenError } from "@/lib/auth/guards";
import { deleteDocument } from "@/lib/documents/service";
beforeEach(() => vi.clearAllMocks());

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("DELETE /api/admin/documents/[id]", () => {
  it("204 when document is deleted successfully", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "u1", role: "admin", isSuperAdmin: false });
    vi.mocked(deleteDocument).mockResolvedValue(true);
    const res = await DELETE(new Request("http://localhost/api/admin/documents/d1", { method: "DELETE" }), makeCtx("d1"));
    expect(res.status).toBe(204);
    expect(deleteDocument).toHaveBeenCalledWith("d1");
  });

  it("404 when document does not exist", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "u1", role: "admin", isSuperAdmin: false });
    vi.mocked(deleteDocument).mockResolvedValue(false);
    const res = await DELETE(new Request("http://localhost/api/admin/documents/missing", { method: "DELETE" }), makeCtx("missing"));
    expect(res.status).toBe(404);
  });

  it("403 for non-admin", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenError());
    const res = await DELETE(new Request("http://localhost/api/admin/documents/d1", { method: "DELETE" }), makeCtx("d1"));
    expect(res.status).toBe(403);
    expect(deleteDocument).not.toHaveBeenCalled();
  });
});
