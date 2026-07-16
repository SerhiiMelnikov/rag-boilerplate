import { describe, it, expect, vi } from "vitest";
import { registerUser } from "./handler";
import { EmailNotConfiguredError } from "@/lib/email/sender";

const SETTINGS = {
  registrationMode: "verified", allowedEmailDomains: "company.com",
  smtpHost: "smtp.test", smtpPort: 587, smtpUser: "u", smtpFrom: "f@company.com", smtpPassword: "p",
};

function baseDeps() {
  return {
    getSettingsFn: vi.fn(async () => SETTINGS),
    findUserFn: vi.fn(async () => null as { id: string; emailVerifiedAt: Date | null } | null),
    createUserFn: vi.fn(async () => ({ id: "u1", email: "a@company.com", role: "user" as const })),
    resetPasswordFn: vi.fn(async () => undefined),
    deleteUserFn: vi.fn(async () => undefined),
    createTokenFn: vi.fn(async () => "tok"),
    sendEmailFn: vi.fn(async () => undefined),
  };
}

const req = (body: unknown) => new Request("http://test/api/register", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const GOOD = { email: "a@company.com", password: "password123" };

describe("registerUser (verified mode)", () => {
  it("creates an unverified user and emails a link", async () => {
    const deps = baseDeps();
    const res = await registerUser(req(GOOD), deps);
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ status: "verification_sent" });
    expect(deps.createTokenFn).toHaveBeenCalledWith("u1");
    expect(deps.sendEmailFn).toHaveBeenCalled();
  });

  it("never returns the user object — the account is not usable yet", async () => {
    const res = await registerUser(req(GOOD), baseDeps());
    const body = await res.json();
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("email");
  });

  it("refuses a disallowed domain with 403 and names the allowed list", async () => {
    const deps = baseDeps();
    const res = await registerUser(req({ ...GOOD, email: "a@evil.com" }), deps);
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).toContain("company.com");
    expect(deps.createUserFn).not.toHaveBeenCalled();
  });

  it("refuses everything when the allowlist is empty", async () => {
    const deps = baseDeps();
    deps.getSettingsFn = vi.fn(async () => ({ ...SETTINGS, allowedEmailDomains: "" }));
    expect((await registerUser(req(GOOD), deps)).status).toBe(403);
  });

  it("409s when the address is taken and verified", async () => {
    const deps = baseDeps();
    deps.findUserFn = vi.fn(async () => ({ id: "old", emailVerifiedAt: new Date() }));
    const res = await registerUser(req(GOOD), deps);
    expect(res.status).toBe(409);
    expect(deps.sendEmailFn).not.toHaveBeenCalled();
  });

  // Without this, one unverified registration squats an address forever.
  it("resends for an unverified address instead of squatting it", async () => {
    const deps = baseDeps();
    deps.findUserFn = vi.fn(async () => ({ id: "old", emailVerifiedAt: null }));
    const res = await registerUser(req(GOOD), deps);
    expect(res.status).toBe(201);
    expect(deps.resetPasswordFn).toHaveBeenCalledWith("old", "password123");
    expect(deps.createTokenFn).toHaveBeenCalledWith("old");
    expect(deps.sendEmailFn).toHaveBeenCalled();
    expect(deps.createUserFn).not.toHaveBeenCalled();
  });

  it("503s when SMTP is not configured", async () => {
    const deps = baseDeps();
    deps.sendEmailFn = vi.fn(async () => { throw new EmailNotConfiguredError(); });
    expect((await registerUser(req(GOOD), deps)).status).toBe(503);
  });

  // A user who holds the address but cannot log in or re-register is worse than none.
  it("rolls the user back when sending fails", async () => {
    const deps = baseDeps();
    deps.sendEmailFn = vi.fn(async () => { throw new Error("smtp down"); });
    const res = await registerUser(req(GOOD), deps);
    expect(res.status).toBe(503);
    expect(deps.deleteUserFn).toHaveBeenCalledWith("u1");
  });

  it("does not roll back a pre-existing unverified user when sending fails", async () => {
    const deps = baseDeps();
    deps.findUserFn = vi.fn(async () => ({ id: "old", emailVerifiedAt: null }));
    deps.sendEmailFn = vi.fn(async () => { throw new Error("smtp down"); });
    await registerUser(req(GOOD), deps);
    expect(deps.deleteUserFn).not.toHaveBeenCalled();
  });

  it("still rejects invalid input with 400", async () => {
    expect((await registerUser(req({ email: "nope", password: "x" }), baseDeps())).status).toBe(400);
  });
});
