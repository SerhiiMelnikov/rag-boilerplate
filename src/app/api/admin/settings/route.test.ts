import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guards", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/guards");
  return { ...actual, requireAdmin: vi.fn() };
});
vi.mock("@/lib/settings/service", () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  settingsPatchSchema: { safeParse: (v: any) => ({ success: true, data: v }) },
}));

import { GET, PUT } from "@/app/api/admin/settings/route";
import { requireAdmin, ForbiddenError } from "@/lib/auth/guards";
import { getSettings, updateSettings } from "@/lib/settings/service";

const ROW = { topK: 5, model: "gemma-4-31b-it", temperature: 0.2, systemPrompt: "sp", minSimilarity: 0.3, contextTokenBudget: 3000 };
beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/settings", () => {
  it("403 for a non-admin", async () => {
    (requireAdmin as any).mockRejectedValue(new ForbiddenError());
    expect((await GET()).status).toBe(403);
  });
  it("returns settings for an admin", async () => {
    (requireAdmin as any).mockResolvedValue({ id: "u1", role: "admin" });
    (getSettings as any).mockResolvedValue(ROW);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(ROW);
  });
});

describe("PUT /api/admin/settings", () => {
  it("updates and returns settings for an admin", async () => {
    (requireAdmin as any).mockResolvedValue({ id: "u1", role: "admin" });
    (updateSettings as any).mockResolvedValue({ ...ROW, topK: 9 });
    const req = new Request("http://localhost/api/admin/settings", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ topK: 9 }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect((await res.json()).topK).toBe(9);
  });
});
