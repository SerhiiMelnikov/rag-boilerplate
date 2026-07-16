import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guards", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/guards")>("@/lib/auth/guards");
  return { ...actual, requireAdmin: vi.fn() };
});
vi.mock("@/lib/config/settings-service", () => ({
  getAdminSettings: vi.fn(),
  updateSettings: vi.fn(),
  settingsPatchSchema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
}));

import { GET, PUT } from "@/app/api/admin/settings/route";
import { requireAdmin, ForbiddenError } from "@/lib/auth/guards";
import { getAdminSettings, updateSettings } from "@/lib/config/settings-service";

const MASKED = {
  chatProvider: "google", chatModel: "gemma-4-31b-it",
  embeddingProvider: "google", embeddingModel: "gemini-embedding-2",
  parserProvider: "google", parserModel: "gemini-2.5-flash",
  imageProvider: "google", imageModel: "gemini-2.5-flash",
  unifiedMode: false, unifiedProvider: "google", unifiedModel: "gemini-2.5-flash",
  temperature: 0.2, topK: 5, minSimilarity: 0.3, contextTokenBudget: 3000,
  systemPrompt: "sp", ollamaBaseUrl: "http://localhost:11434",
  chatRateLimitPerMinute: 20, chatRateLimitPerDay: 200, registerRateLimitPerHour: 5,
  keys: { google: { set: false, last4: null }, openai: { set: false, last4: null }, anthropic: { set: false, last4: null } },
};
beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/settings", () => {
  it("403 for a non-admin", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenError());
    expect((await GET()).status).toBe(403);
  });
  it("returns masked settings for an admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "u1", role: "admin", isSuperAdmin: false });
    vi.mocked(getAdminSettings).mockResolvedValue(MASKED);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys.google).toEqual({ set: false, last4: null });
    expect(JSON.stringify(body)).not.toContain("AIza"); // no plaintext key shapes
  });
});

describe("PUT /api/admin/settings", () => {
  it("403 for a non-admin", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenError());
    const req = new Request("http://localhost/api/admin/settings", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ topK: 9 }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(403);
    expect(updateSettings).not.toHaveBeenCalled();
  });
  it("updates and returns masked settings for an admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "u1", role: "admin", isSuperAdmin: false });
    vi.mocked(updateSettings).mockResolvedValue({ ...MASKED, topK: 9 });
    const req = new Request("http://localhost/api/admin/settings", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ topK: 9 }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect((await res.json()).topK).toBe(9);
  });
});
