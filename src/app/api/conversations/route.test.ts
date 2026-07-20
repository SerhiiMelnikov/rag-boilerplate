import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth/guards", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/guards")>("@/lib/auth/guards");
  return { ...actual, requireUser: vi.fn() };
});
vi.mock("@/lib/chat/conversations", () => ({ listConversations: vi.fn(), createConversation: vi.fn() }));
// Mirrors the chat handler's collaborator trio (handler.ts:141-142): the repo
// factory and resolver are mocked the same way the route's other DB-touching
// collaborator (conversations) is, so this test never opens a real connection.
vi.mock("@/lib/workspaces/repo", () => ({ createWorkspaceRepo: vi.fn() }));
vi.mock("@/lib/workspaces/access", () => ({ resolveActiveWorkspaceId: vi.fn() }));
import { GET, POST } from "@/app/api/conversations/route";
import { requireUser, UnauthorizedError } from "@/lib/auth/guards";
import { listConversations, createConversation } from "@/lib/chat/conversations";
import { createWorkspaceRepo } from "@/lib/workspaces/repo";
import { resolveActiveWorkspaceId } from "@/lib/workspaces/access";
beforeEach(() => vi.clearAllMocks());

// Build a Request carrying the active-workspace cookie, matching how the chat
// route's tests / the real client send it.
const req = (cookie = "active_workspace=ws-1") => new Request("http://localhost/api/conversations", { headers: { cookie } });

describe("GET /api/conversations", () => {
  it("401 without a session", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError());
    expect((await GET(req())).status).toBe(401);
  });
  it("returns the user's conversations, scoped to the resolved active workspace", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "u1", role: "user", isSuperAdmin: false });
    const fakeRepo = { fake: "repo" };
    vi.mocked(createWorkspaceRepo).mockReturnValue(fakeRepo as never);
    vi.mocked(resolveActiveWorkspaceId).mockResolvedValue("ws-resolved");
    vi.mocked(listConversations).mockResolvedValue([{ id: "c1", title: "t", createdAt: new Date(0) }]);
    const res = await GET(req("active_workspace=ws-1"));
    expect(res.status).toBe(200);
    expect((await res.json()).conversations).toHaveLength(1);
    // Cookie parsed, sanitized against the user's visible workspaces, then forwarded.
    expect(resolveActiveWorkspaceId).toHaveBeenCalledWith("ws-1", "u1", fakeRepo);
    expect(listConversations).toHaveBeenCalledWith("u1", "ws-resolved");
  });
});

describe("POST /api/conversations", () => {
  it("401 without a session", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError());
    const res = await POST(req());
    expect(res.status).toBe(401);
  });
  it("creates a conversation stamped with the resolved active workspace", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "u1", role: "user", isSuperAdmin: false });
    const fakeRepo = { fake: "repo" };
    vi.mocked(createWorkspaceRepo).mockReturnValue(fakeRepo as never);
    vi.mocked(resolveActiveWorkspaceId).mockResolvedValue("ws-resolved");
    vi.mocked(createConversation).mockResolvedValue({ id: "c1" });
    const res = await POST(req("active_workspace=ws-1"));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("c1");
    expect(resolveActiveWorkspaceId).toHaveBeenCalledWith("ws-1", "u1", fakeRepo);
    expect(createConversation).toHaveBeenCalledWith("u1", "New conversation", "ws-resolved");
  });
});
