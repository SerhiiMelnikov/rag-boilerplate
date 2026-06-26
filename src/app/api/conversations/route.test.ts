import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth/guards", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/guards");
  return { ...actual, requireUser: vi.fn() };
});
vi.mock("@/lib/chat/conversations", () => ({ listConversations: vi.fn() }));
import { GET } from "@/app/api/conversations/route";
import { requireUser, UnauthorizedError } from "@/lib/auth/guards";
import { listConversations } from "@/lib/chat/conversations";
beforeEach(() => vi.clearAllMocks());

describe("GET /api/conversations", () => {
  it("401 without a session", async () => {
    (requireUser as any).mockRejectedValue(new UnauthorizedError());
    expect((await GET()).status).toBe(401);
  });
  it("returns the user's conversations", async () => {
    (requireUser as any).mockResolvedValue({ id: "u1", role: "user" });
    (listConversations as any).mockResolvedValue([{ id: "c1", title: "t", createdAt: new Date(0) }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).conversations).toHaveLength(1);
    expect(listConversations).toHaveBeenCalledWith("u1");
  });
});
