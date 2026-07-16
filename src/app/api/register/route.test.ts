import { describe, it, expect, vi, afterEach } from "vitest";
import { registerUser } from "./handler";
import { EmailNotConfiguredError } from "@/lib/email/sender";

const SETTINGS = {
  allowedEmailDomains: "company.com",
  smtpHost: "smtp.test", smtpPort: 587, smtpUser: "u", smtpFrom: "f@company.com", smtpPassword: "p",
};

// AUTH_URL is read straight from process.env by the handler; stubbing (and always
// unstubbing) it here keeps that global mutation from leaking into other tests.
afterEach(() => {
  vi.unstubAllEnvs();
});

function baseDeps() {
  return {
    getSettingsFn: vi.fn(async () => SETTINGS),
    findUserFn: vi.fn(async () => null as { id: string; emailVerifiedAt: Date | null } | null),
    createUserFn: vi.fn(async () => ({ id: "u1", email: "a@company.com", role: "user" as const })),
    deleteUserFn: vi.fn(async () => undefined),
    createTokenFn: vi.fn(async () => "tok"),
    // A stub, not the real bcrypt hash, so assertions can check exactly what
    // travels to createTokenFn without paying (or depending on) real hashing cost.
    hashPasswordFn: vi.fn(async (pw: string) => `hashed:${pw}`),
    // Explicit param type: without it, TS infers a zero-arg mock (same inference
    // gap as findUserForRegistration — see users.ts), and `mock.calls[0][0]` below
    // would not type-check.
    sendEmailFn: vi.fn(async (_msg: { to: string; subject: string; html: string }) => undefined),
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
    expect(deps.createTokenFn).toHaveBeenCalledWith("u1", "hashed:password123");
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

  // Without this, one unverified registration squats an address forever. Note
  // what does NOT happen here: no function exists any more that can write
  // users.passwordHash for a pre-existing row (createUserFn — the only thing
  // that can — must stay uncalled), which is the account-pre-hijack fix: a
  // re-registration only ever mints a new token carrying the new hash, so the
  // previous owner's already-mailed link is left to resolve to whatever
  // password it was minted with (see verification.test.ts for the full attack
  // reproduction).
  it("resends for an unverified address instead of squatting it", async () => {
    const deps = baseDeps();
    deps.findUserFn = vi.fn(async () => ({ id: "old", emailVerifiedAt: null }));
    const res = await registerUser(req(GOOD), deps);
    expect(res.status).toBe(201);
    expect(deps.createTokenFn).toHaveBeenCalledWith("old", "hashed:password123");
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

describe("registerUser verification link", () => {
  it("uses AUTH_URL when it is set", async () => {
    vi.stubEnv("AUTH_URL", "https://app.example.com");
    const deps = baseDeps();
    await registerUser(req(GOOD), deps);
    const { html } = deps.sendEmailFn.mock.calls[0][0];
    expect(html).toContain("https://app.example.com/api/auth/verify?token=tok");
    expect(html).not.toContain("localhost:3000");
  });

  it("falls back to the request's own origin when AUTH_URL is unset in development", async () => {
    vi.stubEnv("AUTH_URL", undefined);
    vi.stubEnv("NODE_ENV", "development");
    const deps = baseDeps();
    await registerUser(req(GOOD), deps);
    const { html } = deps.sendEmailFn.mock.calls[0][0];
    // req() builds its Request against "http://test/..." — the link must be
    // derived from that origin, never a hardcoded default.
    expect(html).toContain("http://test/api/auth/verify?token=tok");
    expect(html).not.toContain("localhost:3000");
  });

  // A proxy that forwards the client's Host verbatim (proxy_set_header Host $host,
  // a very common recipe) would let an attacker POSTing with a spoofed Host mint a
  // victim's verification link pointing at the attacker's own server. /api/register
  // is not an Auth.js route, so AUTH_TRUST_HOST does not guard it. In production we
  // must not trust the request at all: fail loudly instead of sending an untrusted link.
  it("503s and sends nothing when AUTH_URL is unset in production", async () => {
    vi.stubEnv("AUTH_URL", undefined);
    vi.stubEnv("NODE_ENV", "production");
    const deps = baseDeps();
    const res = await registerUser(req(GOOD), deps);
    expect(res.status).toBe(503);
    expect(deps.sendEmailFn).not.toHaveBeenCalled();
    expect(deps.createTokenFn).not.toHaveBeenCalled();
    expect(deps.createUserFn).not.toHaveBeenCalled();
  });
});
