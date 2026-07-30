import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { oauthHandoff } from "./handler";
import { requireUser } from "@/lib/auth/guards";
import type { getAuthUserById } from "@/lib/auth/users";
import { encodeSessionToken } from "@/lib/auth/session";

const req = (init?: RequestInit) => new Request("http://api.test/api/auth/oauth/handoff", init);

// The database row requireUser reads on every request.
type DbUser = {
  id: string;
  role: "admin" | "user";
  isSuperAdmin: boolean;
  blockedAt: Date | null;
  sessionsValidFrom: Date | null;
};
const liveRow: DbUser = { id: "u1", role: "user", isSuperAdmin: false, blockedAt: null, sessionsValidFrom: null };

// The REAL requireUser with only the database lookup faked — not a stubbed
// "is there a session" predicate. That is the point: the handoff must resolve
// its caller through the one function that carries the block/deletion checks
// and the 0.5.7 sessions_valid_from cut-off, so the tests have to drive those
// checks rather than a stand-in that cannot fail them.
function deps(row: DbUser | null, session?: { id: string; role: string; isSuperAdmin: boolean; sessionIssuedAt: number | null }) {
  return {
    requireUserFn: ((request: Request) =>
      requireUser(request, {
        // Cast through unknown for the reason guards.test.ts documents on the
        // same fake: getAuthUserById's inferred return type is non-nullable even
        // though it really returns null for a missing row.
        getAuthUser: (async () => row) as unknown as typeof getAuthUserById,
        // Omitted for the real-token tests below, so requireUser reads the
        // request itself via getSessionFromRequest exactly as it does in
        // production.
        ...(session === undefined ? {} : { getSession: async () => session }),
      })) as typeof requireUser,
    createCodeFn: vi.fn(async () => "code-123"),
  };
}
const live = { id: "u1", role: "user", isSuperAdmin: false, sessionIssuedAt: 1_700_000_000 };

const saved = { url: process.env.OAUTH_SUCCESS_URL };
beforeEach(() => { process.env.OAUTH_SUCCESS_URL = "https://consumer.app/signed-in"; });
afterEach(() => {
  if (saved.url === undefined) delete process.env.OAUTH_SUCCESS_URL;
  else process.env.OAUTH_SUCCESS_URL = saved.url;
});

describe("oauthHandoff", () => {
  it("mints a code and redirects to the configured consumer", async () => {
    const d = deps(liveRow, live);
    const res = await oauthHandoff(req(), d);
    expect(res.status).toBe(302);
    expect(d.createCodeFn).toHaveBeenCalledWith("u1");
    expect(res.headers.get("location")).toBe("https://consumer.app/signed-in?code=code-123");
  });

  // The browser is left holding a cookie it can no longer use for anything; the
  // bearer token it is about to exchange for replaces it.
  it("clears the session cookie on the way out", async () => {
    const res = await oauthHandoff(req(), deps(liveRow, live));
    const cookies = res.headers.getSetCookie().join("; ");
    expect(cookies).toContain("authjs.session-token=");
    expect(cookies).toContain("Max-Age=0");
  });

  // Browsers enforce the `__Secure-` name-prefix rule and reject a Set-Cookie for
  // such a name outright unless it carries `Secure` — so the `__Secure-` clear
  // MUST carry it (production Auth.js sets exactly that cookie), while the
  // bare-name clear must NOT (it is the dev-mode, plain-http cookie, and adding
  // `Secure` there would make that clear silently no-op instead). A blanket
  // fix in either direction breaks one of these two assertions.
  it("marks only the __Secure-prefixed cookie clear as Secure", async () => {
    const res = await oauthHandoff(req(), deps(liveRow, live));
    const cookies = res.headers.getSetCookie();
    const secureCookie = cookies.find((c) => c.startsWith("__Secure-authjs.session-token="));
    const bareCookie = cookies.find((c) => c.startsWith("authjs.session-token=") && !c.startsWith("__Secure-"));
    expect(secureCookie).toContain("; Secure");
    expect(bareCookie).not.toContain("Secure");
  });

  // A full-app deployment has no headless consumer, so the endpoint means nothing.
  it("is absent when no consumer is configured", async () => {
    delete process.env.OAUTH_SUCCESS_URL;
    const d = deps(liveRow, live);
    expect((await oauthHandoff(req(), d)).status).toBe(404);
    expect(d.createCodeFn).not.toHaveBeenCalled();
  });

  it("mints nothing without a session", async () => {
    const d = deps(liveRow, undefined);
    const res = await oauthHandoff(req(), d);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://consumer.app/signed-in?error=oauth_failed");
    expect(d.createCodeFn).not.toHaveBeenCalled();
  });

  // Every check requireUser owns, reached through this endpoint. Blocked and
  // deleted matter because the exchange re-reads the row and would catch them a
  // step later; the cut-off is the one nothing else catches — see below.
  it.each([
    ["a blocked account", { ...liveRow, blockedAt: new Date() } as DbUser],
    ["a deleted account", null],
  ])("mints nothing for %s", async (_label, row) => {
    const d = deps(row, live);
    const res = await oauthHandoff(req(), d);
    expect(res.headers.get("location")).toBe("https://consumer.app/signed-in?error=oauth_failed");
    expect(d.createCodeFn).not.toHaveBeenCalled();
  });

  // The laundering path 0.5.7 closed everywhere else. A REAL token on a REAL
  // Authorization header, resolved by the REAL getSessionFromRequest inside
  // requireUser — because the endpoint accepts a bearer token, an attacker
  // holding a stolen one needs no cookie at all. If this handler resolved its
  // caller by decrypting the token (getSessionFromRequest) instead of by
  // requireUser, it would mint a code here, and exchange would stamp the
  // resulting bearer token with a fresh sessionIssuedAt — restoring in full a
  // session the victim's password reset had already retired.
  describe("the sessions_valid_from cut-off", () => {
    const bearer = async () =>
      req({ headers: { authorization: `Bearer ${await encodeSessionToken({ id: "u1", role: "user", isSuperAdmin: false })}` } });

    it("mints nothing for a session that pre-dates the user's cut-off", async () => {
      // A reset one minute in the future: every token minted now is on the dead
      // side of it.
      const d = deps({ ...liveRow, sessionsValidFrom: new Date(Date.now() + 60_000) });
      const res = await oauthHandoff(await bearer(), d);
      expect(res.headers.get("location")).toBe("https://consumer.app/signed-in?error=oauth_failed");
      expect(d.createCodeFn).not.toHaveBeenCalled();
    });

    // The control: the same real token, the same real decode path, no cut-off.
    // Without this, the test above would pass just as happily against a handler
    // that refused every bearer token it was ever given.
    it("still mints for the same token when no cut-off applies", async () => {
      const d = deps(liveRow);
      const res = await oauthHandoff(await bearer(), d);
      expect(res.headers.get("location")).toBe("https://consumer.app/signed-in?code=code-123");
      expect(d.createCodeFn).toHaveBeenCalledWith("u1");
    });
  });
});
