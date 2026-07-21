import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { registerUser } from "@/api/register/handler";
import { EmailNotConfiguredError } from "@/lib/email/sender";
import { consume, __resetPruneThrottle } from "@/lib/ratelimit/store";

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
    // Explicit param type: without it, TS infers a zero-arg mock, and
    // `mock.calls[0][0]` below would not type-check.
    sendEmailFn: vi.fn(async (_msg: { to: string; subject: string; html: string }) => undefined),
    // Defaults to "always allowed" / "no-op sweep" so every test above the
    // "rate limiting" and "housekeeping" describe blocks below is exercising
    // registration logic, not the throttle or the prune — those get their own
    // dedicated tests further down.
    rateLimitFn: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
    pruneFn: vi.fn(async () => undefined),
  };
}

const req = (body: unknown) => new Request("http://test/api/register", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const GOOD = { email: "a@company.com" };
const HOUR_MS = 60 * 60 * 1000;

describe("registerUser (verified mode)", () => {
  it("creates an unverified user with no password of its own and emails a link", async () => {
    const deps = baseDeps();
    const res = await registerUser(req(GOOD), deps);
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ status: "verification_sent" });
    // The password is never decided at registration time: createUserFn/createTokenFn
    // take only what registerSchema parsed out — an email, nothing else.
    expect(deps.createUserFn).toHaveBeenCalledWith({ email: "a@company.com", role: "user" });
    expect(deps.createTokenFn).toHaveBeenCalledWith("u1");
    expect(deps.sendEmailFn).toHaveBeenCalled();
  });

  it("never returns the user object — the account is not usable yet", async () => {
    const res = await registerUser(req(GOOD), baseDeps());
    const body = await res.json();
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("email");
  });

  it("the emailed link points at the choose-a-password page, not an API route", async () => {
    const deps = baseDeps();
    await registerUser(req(GOOD), deps);
    const { html } = deps.sendEmailFn.mock.calls[0][0];
    expect(html).toContain("/verify?token=tok");
    expect(html).not.toContain("/api/auth/verify");
  });

  it("refuses a disallowed domain with 403 and names the allowed list", async () => {
    const deps = baseDeps();
    const res = await registerUser(req({ email: "a@evil.com" }), deps);
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
  // what does NOT happen here: createUserFn (the only thing that can write a new
  // users row) must stay uncalled — a re-registration only ever mints a new
  // token, and multiple live tokens for the same address are harmless, since
  // none of them carries a password (see verification.test.ts for the full
  // attack reproduction).
  it("resends for an unverified address instead of squatting it", async () => {
    const deps = baseDeps();
    deps.findUserFn = vi.fn(async () => ({ id: "old", emailVerifiedAt: null }));
    const res = await registerUser(req(GOOD), deps);
    expect(res.status).toBe(201);
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
    expect((await registerUser(req({ email: "nope" }), baseDeps())).status).toBe(400);
  });

  it("400s when the body has no email at all", async () => {
    expect((await registerUser(req({}), baseDeps())).status).toBe(400);
  });
});

describe("registerUser verification link", () => {
  it("uses AUTH_URL when it is set", async () => {
    vi.stubEnv("AUTH_URL", "https://app.example.com");
    const deps = baseDeps();
    await registerUser(req(GOOD), deps);
    const { html } = deps.sendEmailFn.mock.calls[0][0];
    expect(html).toContain("https://app.example.com/verify?token=tok");
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
    expect(html).toContain("http://test/verify?token=tok");
    expect(html).not.toContain("localhost:3000");
  });

  // Headless (api-only) mode: there is no Next `/verify` page to point at, so
  // the consumer's own frontend supplies the full URL of its verify screen.
  // It must win over AUTH_URL when both are set — AUTH_URL is this app's own
  // origin, not where a headless consumer's UI lives.
  it("prefers VERIFY_URL over AUTH_URL when set, for a headless consumer's own verify page", async () => {
    vi.stubEnv("VERIFY_URL", "https://consumer.app/verify");
    vi.stubEnv("AUTH_URL", "https://app.example.com");
    const deps = baseDeps();
    await registerUser(req(GOOD), deps);
    const { html } = deps.sendEmailFn.mock.calls[0][0];
    expect(html).toContain("https://consumer.app/verify?token=tok");
    expect(html).not.toContain("app.example.com");
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

// Minimal fake modelling the same (key, windowStart) counter store.test.ts's own
// suite uses for ratelimit/store.ts — just enough for the REAL consume() to do
// its real atomic-upsert-style counting against, with no Postgres involved.
// `delete` is a no-op: consume()'s own opportunistic prune fires on every call,
// and it must not blow up here even though nothing in this file cares about it.
function fakeRateLimitDb() {
  const counters = new Map<string, number>();
  return {
    insert: () => ({
      values: ({ key, windowStart }: { key: string; windowStart: Date }) => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            const k = `${key}@${windowStart.toISOString()}`;
            const next = (counters.get(k) ?? 0) + 1;
            counters.set(k, next);
            return [{ count: next }];
          },
        }),
      }),
    }),
    delete: () => ({ where: async () => undefined }),
  } as never;
}

describe("registerUser rate limiting", () => {
  beforeEach(() => {
    // consume()'s own module-level prune throttle is process-wide state; reset
    // it so one test's timing can't silently skip another's opportunistic prune.
    __resetPruneThrottle();
  });

  // Ordering constraint #1: a domain the allowlist was always going to refuse
  // must not spend any of the limiter's budget — the free, DB-less domain
  // check runs first and short-circuits before the limiter is ever touched.
  it("does not consult the rate limiter for a domain the allowlist refuses", async () => {
    const deps = baseDeps();
    const res = await registerUser(req({ email: "a@evil.com" }), deps);
    expect(res.status).toBe(403);
    expect(deps.rateLimitFn).not.toHaveBeenCalled();
  });

  it("keys the limiter on the trimmed, lowercased address", async () => {
    const deps = baseDeps();
    await registerUser(req({ email: "A@Company.com" }), deps);
    expect(deps.rateLimitFn).toHaveBeenCalledWith(
      "register:email:a@company.com",
      expect.any(Number),
      expect.any(Number),
    );
  });

  // Ordering constraint #2: the limiter's verdict must never be correlated with
  // whether the address is already registered — it is checked (and can refuse)
  // strictly before findUserFn, the only thing that would tell them apart.
  it("refuses with 429 and Retry-After, before ever looking up or emailing the address, once the limiter denies", async () => {
    const deps = baseDeps();
    deps.rateLimitFn = vi.fn(async () => ({ allowed: false, retryAfterSeconds: 17 }));
    const res = await registerUser(req(GOOD), deps);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("17");
    expect(deps.findUserFn).not.toHaveBeenCalled();
    expect(deps.createUserFn).not.toHaveBeenCalled();
    expect(deps.createTokenFn).not.toHaveBeenCalled();
    expect(deps.sendEmailFn).not.toHaveBeenCalled();
  });

  // The finding, made non-vacuous against the REAL consume() (not a mock): five
  // registrations for one address succeed, the sixth is refused with no mail
  // sent, and a completely different address is unaffected. To see this fail,
  // remove the rate-limit block from handler.ts (or raise
  // REGISTER_RATE_LIMIT_PER_EMAIL past 6) and re-run this file.
  it("throttles a single address to REGISTER_RATE_LIMIT_PER_EMAIL requests per window, using the real limiter", async () => {
    const db = fakeRateLimitDb();
    const now = () => 1_700_000_000_000;
    const deps = baseDeps();
    deps.rateLimitFn = vi.fn((key: string, limit: number, windowMs: number) =>
      consume(key, limit, windowMs, { database: db, now }),
    );

    for (let i = 0; i < 5; i++) {
      const res = await registerUser(req(GOOD), deps);
      expect(res.status).toBe(201);
    }
    expect(deps.sendEmailFn).toHaveBeenCalledTimes(5);

    const sixth = await registerUser(req(GOOD), deps);
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("Retry-After")).toBeTruthy();
    expect(deps.sendEmailFn).toHaveBeenCalledTimes(5); // the 6th sent no mail

    // A different address is an entirely separate bucket.
    const other = await registerUser(req({ email: "other@company.com" }), deps);
    expect(other.status).toBe(201);
    expect(deps.sendEmailFn).toHaveBeenCalledTimes(6);
  });

  // The finding this bucket exists to close: the per-address bucket above keys
  // on the exact address string, so it never sees "victim+0@company.com" ..
  // "victim+5@company.com" as the same target — yet Gmail, Google Workspace,
  // Fastmail and Proton all deliver every one of those to the ONE real
  // "victim@company.com" mailbox. Before this bucket existed, six such variants
  // produced six emails (unbounded). The register:domain: bucket below is what
  // actually bounds it, because it counts every attempt at the domain
  // regardless of local part.
  //
  // Non-vacuity: temporarily remove the `register:domain:` entry from the
  // rate-limit loop in handler.ts and re-run this file — this test fails (all
  // six variants get through, sendEmailFn called 6 times).
  it("bounds the plus-address evasion: six victim+N@ variants do not all get through once the domain's shared quota is spent", async () => {
    const db = fakeRateLimitDb();
    const now = () => 1_700_000_000_000;
    const deps = baseDeps();
    deps.rateLimitFn = vi.fn((key: string, limit: number, windowMs: number) =>
      consume(key, limit, windowMs, { database: db, now }),
    );

    // Must match REGISTER_DOMAIN_RATE_LIMIT_PER_HOUR in handler.ts.
    const DOMAIN_LIMIT = 50;
    // Simulate the domain's hourly quota already mostly spent (prior real
    // signups, or the attacker's own earlier attempts under other invented
    // local parts) so only 3 slots remain — a completely fresh bucket would
    // take 50 requests to reach the interesting part of this test.
    for (let i = 0; i < DOMAIN_LIMIT - 3; i++) {
      await consume("register:domain:company.com", DOMAIN_LIMIT, HOUR_MS, { database: db, now });
    }

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await registerUser(req({ email: `victim+${i}@company.com` }), deps);
      statuses.push(res.status);
    }

    expect(statuses.filter((s) => s === 201).length).toBe(3); // only the 3 remaining domain slots
    expect(statuses.filter((s) => s === 429).length).toBe(3);
    expect(deps.sendEmailFn).toHaveBeenCalledTimes(3); // NOT six — the whole point of the finding
  });

  it("a different domain is a separate bucket, unaffected by another domain's exhausted quota", async () => {
    const db = fakeRateLimitDb();
    const now = () => 1_700_000_000_000;
    const deps = baseDeps();
    deps.getSettingsFn = vi.fn(async () => ({ ...SETTINGS, allowedEmailDomains: "company.com,other.org" }));
    deps.rateLimitFn = vi.fn((key: string, limit: number, windowMs: number) =>
      consume(key, limit, windowMs, { database: db, now }),
    );

    const DOMAIN_LIMIT = 50;
    for (let i = 0; i < DOMAIN_LIMIT; i++) {
      await consume("register:domain:company.com", DOMAIN_LIMIT, HOUR_MS, { database: db, now });
    }
    const blocked = await registerUser(req({ email: "someone@company.com" }), deps);
    expect(blocked.status).toBe(429);

    // A wholly different domain's bucket was never touched by the above.
    const ok = await registerUser(req({ email: "someone@other.org" }), deps);
    expect(ok.status).toBe(201);
    expect(deps.sendEmailFn).toHaveBeenCalledTimes(1);
  });

  // Ordering constraint #3 (the new one): a request already refused by the
  // tighter per-address bucket must not spend any of the shared domain
  // bucket's budget.
  it("does not consult the domain bucket once the per-address bucket has already refused", async () => {
    const deps = baseDeps();
    const calls: string[] = [];
    deps.rateLimitFn = vi.fn(async (key: string) => {
      calls.push(key);
      if (key.startsWith("register:email:")) return { allowed: false, retryAfterSeconds: 5 };
      return { allowed: true, retryAfterSeconds: 0 };
    });
    const res = await registerUser(req(GOOD), deps);
    expect(res.status).toBe(429);
    expect(calls).toEqual(["register:email:a@company.com"]); // the domain bucket key was never even requested
  });

  // The domain bucket alone can also refuse — and must produce the same
  // "no mail, no user" outcome as the per-address bucket.
  it("refuses with 429 when only the domain bucket denies, sending no mail and creating no user", async () => {
    const deps = baseDeps();
    deps.rateLimitFn = vi.fn(async (key: string) => {
      if (key.startsWith("register:domain:")) return { allowed: false, retryAfterSeconds: 9 };
      return { allowed: true, retryAfterSeconds: 0 };
    });
    const res = await registerUser(req(GOOD), deps);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("9");
    expect(deps.findUserFn).not.toHaveBeenCalled();
    expect(deps.createUserFn).not.toHaveBeenCalled();
    expect(deps.sendEmailFn).not.toHaveBeenCalled();
  });
});

describe("registerUser opportunistic housekeeping", () => {
  it("sweeps expired tokens/abandoned registrations on every request", async () => {
    const deps = baseDeps();
    await registerUser(req(GOOD), deps);
    expect(deps.pruneFn).toHaveBeenCalled();
  });

  // Housekeeping rides along on the request; it must never be able to break it.
  it("a failing sweep does not fail or change the response it rode in on", async () => {
    const deps = baseDeps();
    deps.pruneFn = vi.fn(async () => {
      throw new Error("db hiccup");
    });
    const res = await registerUser(req(GOOD), deps);
    expect(res.status).toBe(201);
  });
});
