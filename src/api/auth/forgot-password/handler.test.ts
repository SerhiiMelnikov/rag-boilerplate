import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { forgotPassword } from "./handler";
import { EmailNotConfiguredError } from "@/lib/email/sender";

const req = (body: unknown, url = "http://test/api/auth/forgot-password") =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

type User = { id: string; emailVerifiedAt: Date | null; blockedAt: Date | null } | null;

function deps(user: User) {
  return {
    findUserFn: vi.fn(async () => user),
    createTokenFn: vi.fn(async () => "tok-123"),
    sendEmailFn: vi.fn(async (_msg: { to: string; subject: string; html: string }) => undefined),
    rateLimitFn: vi.fn(async (_key: string, _limit: number, _windowMs: number) => ({ allowed: true, retryAfterSeconds: 0 })),
    pruneFn: vi.fn(async () => {}),
  };
}

const verified: User = { id: "u1", emailVerifiedAt: new Date(), blockedAt: null };

// AUTH_URL / RESET_URL / NODE_ENV are read straight from process.env by the
// handler. Stubbing them (and always unstubbing) keeps that global mutation from
// leaking into every later file in the same worker — an earlier version deleted
// AUTH_URL and restored only NODE_ENV, which left the variable missing for
// everything that ran afterwards.
beforeEach(() => {
  vi.stubEnv("AUTH_URL", "https://app.example");
  vi.stubEnv("RESET_URL", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("forgotPassword", () => {
  // The whole point of this endpoint's shape: an unauthenticated caller must not
  // be able to learn whether an address has an account. Any difference in status
  // or body between these four cases turns it into a free enumeration oracle.
  it.each([
    ["no such user", null as User],
    ["unverified user", { id: "u1", emailVerifiedAt: null, blockedAt: null } as User],
    ["blocked user", { id: "u1", emailVerifiedAt: new Date(), blockedAt: new Date() } as User],
    ["resettable user", verified],
  ])("answers identically for %s", async (_label, user) => {
    const res = await forgotPassword(req({ email: "a@b.test" }), deps(user));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "reset_sent" });
  });

  it("sends mail only for a verified, unblocked user", async () => {
    for (const user of [null, { id: "u1", emailVerifiedAt: null, blockedAt: null },
                        { id: "u1", emailVerifiedAt: new Date(), blockedAt: new Date() }] as User[]) {
      const d = deps(user);
      await forgotPassword(req({ email: "a@b.test" }), d);
      expect(d.sendEmailFn).not.toHaveBeenCalled();
      expect(d.createTokenFn).not.toHaveBeenCalled();
    }
    const d = deps(verified);
    await forgotPassword(req({ email: "a@b.test" }), d);
    expect(d.createTokenFn).toHaveBeenCalledWith("u1");
    expect(d.sendEmailFn).toHaveBeenCalledTimes(1);
    const msg = d.sendEmailFn.mock.calls[0][0] as { to: string; html: string };
    expect(msg.to).toBe("a@b.test");
    expect(msg.html).toContain("https://app.example/reset?token=tok-123");
  });

  it("points the link at RESET_URL when set, as a complete target", async () => {
    vi.stubEnv("RESET_URL", "https://consumer.app/choose-password");
    const d = deps(verified);
    await forgotPassword(req({ email: "a@b.test" }), d);
    const msg = d.sendEmailFn.mock.calls[0][0] as { html: string };
    expect(msg.html).toContain("https://consumer.app/choose-password?token=tok-123");
    expect(msg.html).not.toContain("/reset?token");
  });

  it("rejects a malformed body", async () => {
    const d = deps(verified);
    const res = await forgotPassword(
      new Request("http://test/api/auth/forgot-password", {
        method: "POST", headers: { "content-type": "application/json" }, body: "{oops",
      }), d);
    expect(res.status).toBe(400);
    expect(d.findUserFn).not.toHaveBeenCalled();
  });

  // Two independent buckets, checked in a short-circuiting loop. The per-address
  // bucket alone bounds nothing: victim+1@x.com .. victim+N@x.com are distinct
  // strings with distinct buckets but ONE real mailbox.
  it("consumes a per-address bucket and then a per-domain bucket", async () => {
    const d = deps(verified);
    await forgotPassword(req({ email: "Boss@Company.com" }), d);
    expect(d.rateLimitFn.mock.calls.map((c) => c[0])).toEqual([
      "reset:email:boss@company.com",
      "reset:domain:company.com",
    ]);
    expect(d.rateLimitFn.mock.calls[0][1]).toBe(5);
    expect(d.rateLimitFn.mock.calls[1][1]).toBe(50);
  });

  // A request the tighter bucket already refuses must not also spend a slot of
  // the domain's shared budget.
  it("does not touch the domain bucket when the address bucket denies", async () => {
    const d = deps(verified);
    d.rateLimitFn.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 42 });
    const res = await forgotPassword(req({ email: "a@b.test" }), d);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    expect(d.rateLimitFn).toHaveBeenCalledTimes(1);
    expect(d.findUserFn).not.toHaveBeenCalled();
  });

  // Checked BEFORE the lookup so a 429 can never be correlated with existence.
  it("refuses before looking the address up", async () => {
    const d = deps(null);
    d.rateLimitFn.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 1 });
    await forgotPassword(req({ email: "a@b.test" }), d);
    expect(d.findUserFn).not.toHaveBeenCalled();
  });

  it("reports 503 when SMTP is not configured", async () => {
    const d = deps(verified);
    d.sendEmailFn.mockRejectedValueOnce(new EmailNotConfiguredError());
    const res = await forgotPassword(req({ email: "a@b.test" }), d);
    expect(res.status).toBe(503);
  });

  it("refuses to mint a link from the request Host in production", async () => {
    vi.stubEnv("AUTH_URL", undefined);
    vi.stubEnv("NODE_ENV", "production");
    const d = deps(verified);
    const res = await forgotPassword(req({ email: "a@b.test" }), d);
    expect(res.status).toBe(503);
    expect(d.findUserFn).not.toHaveBeenCalled();
  });

  it("sweeps expired tokens without blocking the response", async () => {
    const d = deps(verified);
    await forgotPassword(req({ email: "a@b.test" }), d);
    expect(d.pruneFn).toHaveBeenCalled();
  });
});
