import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth/guards", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/guards");
  return { ...actual, requireUser: vi.fn() };
});
vi.mock("@/lib/chat/conversations", () => ({ setRating: vi.fn() }));
import { POST } from "@/app/api/messages/[id]/rating/route";
import { requireUser } from "@/lib/auth/guards";
import { setRating } from "@/lib/chat/conversations";
beforeEach(() => vi.clearAllMocks());
const ctx = { params: Promise.resolve({ id: "m1" }) };
const req = (b: unknown) => new Request("http://localhost/api/messages/m1/rating", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
});

describe("POST /api/messages/:id/rating", () => {
  it("400 on invalid rating value", async () => {
    (requireUser as any).mockResolvedValue({ id: "u1", role: "user" });
    expect((await POST(req({ rating: 5 }), ctx)).status).toBe(400);
  });
  it("200 when the owned message is rated", async () => {
    (requireUser as any).mockResolvedValue({ id: "u1", role: "user" });
    (setRating as any).mockResolvedValue(true);
    const res = await POST(req({ rating: 1 }), ctx);
    expect(res.status).toBe(200);
    expect(setRating).toHaveBeenCalledWith("u1", "m1", 1);
  });
  it("404 when not owned", async () => {
    (requireUser as any).mockResolvedValue({ id: "u1", role: "user" });
    (setRating as any).mockResolvedValue(false);
    expect((await POST(req({ rating: -1 }), ctx)).status).toBe(404);
  });
});
