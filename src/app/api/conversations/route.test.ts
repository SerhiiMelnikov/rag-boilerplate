import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth/guards", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/guards")>("@/lib/auth/guards");
  return { ...actual, requireUser: vi.fn() };
});
vi.mock("@/lib/chat/conversations", () => ({ listConversations: vi.fn(), createConversation: vi.fn() }));
import { GET, POST } from "@/app/api/conversations/route";
import { requireUser, UnauthorizedError } from "@/lib/auth/guards";
import { listConversations, createConversation } from "@/lib/chat/conversations";
beforeEach(() => vi.clearAllMocks());

describe("GET /api/conversations", () => {
  it("401 without a session", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError());
    expect((await GET()).status).toBe(401);
  });
  it("returns the user's conversations", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "u1", role: "user", isSuperAdmin: false });
    vi.mocked(listConversations).mockResolvedValue([{ id: "c1", title: "t", createdAt: new Date(0) }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).conversations).toHaveLength(1);
    expect(listConversations).toHaveBeenCalledWith("u1");
  });
});

describe("POST /api/conversations", () => {
  it("401 without a session", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError());
    const res = await POST();
    expect(res.status).toBe(401);
  });
  it("creates a conversation for the user", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "u1", role: "user", isSuperAdmin: false });
    vi.mocked(createConversation).mockResolvedValue({ id: "c1" });
    const res = await POST();
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("c1");
    expect(createConversation).toHaveBeenCalledWith("u1", "New conversation");
  });
});
