import { describe, it, expect, vi } from "vitest";
import { getSettingsResponse, updateSettingsResponse } from "./handler";
import { ForbiddenError } from "@/lib/auth/guards";

const admin = vi.fn(async () => ({ id: "u1", role: "admin", isSuperAdmin: false }));

const MASKED = {
  chatProvider: "google", chatModel: "gemma-4-31b-it",
  embeddingProvider: "google", embeddingModel: "gemini-embedding-2",
  parserProvider: "google", parserModel: "gemini-2.5-flash",
  imageProvider: "google", imageModel: "gemini-2.5-flash",
  unifiedMode: false, unifiedProvider: "google", unifiedModel: "gemini-2.5-flash",
  temperature: 0.2, topK: 5, minSimilarity: 0.3, contextTokenBudget: 3000,
  systemPrompt: "sp", ollamaBaseUrl: "http://localhost:11434",
  chatRateLimitPerMinute: 20, chatRateLimitPerDay: 200,
  allowedEmailDomains: "",
  smtpHost: "", smtpPort: 587, smtpUser: "", smtpFrom: "",
  keys: { google: { set: false, last4: null }, openai: { set: false, last4: null }, anthropic: { set: false, last4: null } },
  smtpPassword: { set: false, last4: null },
};

const req = (body: unknown) => new Request("http://localhost/api/admin/settings", {
  method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const getReq = () => new Request("http://localhost/api/admin/settings");

describe("getSettingsResponse", () => {
  it("403s a non-admin", async () => {
    const getAdminSettingsFn = vi.fn();
    const res = await getSettingsResponse(getReq(), {
      getAdmin: (async () => { throw new ForbiddenError(); }) as never,
      getAdminSettingsFn: getAdminSettingsFn as never,
    });
    expect(res.status).toBe(403);
    expect(getAdminSettingsFn).not.toHaveBeenCalled();
  });

  it("returns masked settings for an admin", async () => {
    const getAdminSettingsFn = vi.fn(async () => MASKED);
    const res = await getSettingsResponse(getReq(), { getAdmin: admin as never, getAdminSettingsFn: getAdminSettingsFn as never });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys.google).toEqual({ set: false, last4: null });
    expect(JSON.stringify(body)).not.toContain("AIza");
  });
});

describe("updateSettingsResponse", () => {
  it("403s a non-admin and does not update", async () => {
    const updateSettingsFn = vi.fn();
    const res = await updateSettingsResponse(req({ topK: 9 }), {
      getAdmin: (async () => { throw new ForbiddenError(); }) as never,
      updateSettingsFn: updateSettingsFn as never,
    });
    expect(res.status).toBe(403);
    expect(updateSettingsFn).not.toHaveBeenCalled();
  });

  it("updates and returns masked settings for an admin", async () => {
    const updateSettingsFn = vi.fn(async () => ({ ...MASKED, topK: 9 }));
    const res = await updateSettingsResponse(req({ topK: 9 }), {
      getAdmin: admin as never,
      updateSettingsFn: updateSettingsFn as never,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).topK).toBe(9);
  });

  it("400s on invalid JSON", async () => {
    const badReq = new Request("http://localhost/api/admin/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: "{not json" });
    const res = await updateSettingsResponse(badReq, { getAdmin: admin as never });
    expect(res.status).toBe(400);
  });

  it("400s on an invalid patch", async () => {
    const res = await updateSettingsResponse(req({ topK: "nope" }), { getAdmin: admin as never });
    expect(res.status).toBe(400);
  });
});
