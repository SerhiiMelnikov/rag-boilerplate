import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth/guards", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/guards");
  return { ...actual, requireUser: vi.fn() };
});
vi.mock("@/lib/chat/conversations", () => ({ getConversationWithMessages: vi.fn(), deleteConversation: vi.fn() }));
import { GET, DELETE } from "@/app/api/conversations/[id]/route";
import { requireUser } from "@/lib/auth/guards";
import { getConversationWithMessages, deleteConversation } from "@/lib/chat/conversations";
beforeEach(() => vi.clearAllMocks());
const ctx = { params: Promise.resolve({ id: "c1" }) };
const url = new Request("http://localhost/api/conversations/c1");

describe("GET /api/conversations/:id", () => {
  it("404 when not found/owned", async () => {
    (requireUser as any).mockResolvedValue({ id: "u1", role: "user" });
    (getConversationWithMessages as any).mockResolvedValue(null);
    expect((await GET(url, ctx)).status).toBe(404);
  });
  it("returns the conversation when owned", async () => {
    (requireUser as any).mockResolvedValue({ id: "u1", role: "user" });
    (getConversationWithMessages as any).mockResolvedValue({ id: "c1", title: "t", messages: [] });
    const res = await GET(url, ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("c1");
    expect(getConversationWithMessages).toHaveBeenCalledWith("u1", "c1");
  });
});

describe("DELETE /api/conversations/:id", () => {
  it("204 when deleted", async () => {
    (requireUser as any).mockResolvedValue({ id: "u1", role: "user" });
    (deleteConversation as any).mockResolvedValue(true);
    expect((await DELETE(url, ctx)).status).toBe(204);
  });
  it("404 when nothing deleted", async () => {
    (requireUser as any).mockResolvedValue({ id: "u1", role: "user" });
    (deleteConversation as any).mockResolvedValue(false);
    expect((await DELETE(url, ctx)).status).toBe(404);
  });
});
