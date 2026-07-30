import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { oauthHandoff } from "./handler";
import type { getSessionFromRequest } from "@/lib/auth/session";

const req = () => new Request("http://api.test/api/auth/oauth/handoff");

function deps(session: { id: string; role: string; isSuperAdmin: boolean } | null) {
  return {
    // Cast through unknown: the handler only ever reads session.id, so the
    // fixture omits RequestSession's sessionIssuedAt — same pattern as
    // guards.test.ts's `session()` fixture for the same reason.
    getSessionFn: vi.fn(async () => session) as unknown as typeof getSessionFromRequest,
    createCodeFn: vi.fn(async () => "code-123"),
  };
}
const live = { id: "u1", role: "user", isSuperAdmin: false };

const saved = { url: process.env.OAUTH_SUCCESS_URL };
beforeEach(() => { process.env.OAUTH_SUCCESS_URL = "https://consumer.app/signed-in"; });
afterEach(() => {
  if (saved.url === undefined) delete process.env.OAUTH_SUCCESS_URL;
  else process.env.OAUTH_SUCCESS_URL = saved.url;
});

describe("oauthHandoff", () => {
  it("mints a code and redirects to the configured consumer", async () => {
    const d = deps(live);
    const res = await oauthHandoff(req(), d);
    expect(res.status).toBe(302);
    expect(d.createCodeFn).toHaveBeenCalledWith("u1");
    expect(res.headers.get("location")).toBe("https://consumer.app/signed-in?code=code-123");
  });

  // The browser is left holding a cookie it can no longer use for anything; the
  // bearer token it is about to exchange for replaces it.
  it("clears the session cookie on the way out", async () => {
    const res = await oauthHandoff(req(), deps(live));
    const cookies = res.headers.getSetCookie().join("; ");
    expect(cookies).toContain("authjs.session-token=");
    expect(cookies).toContain("Max-Age=0");
  });

  // A full-app deployment has no headless consumer, so the endpoint means nothing.
  it("is absent when no consumer is configured", async () => {
    delete process.env.OAUTH_SUCCESS_URL;
    const d = deps(live);
    expect((await oauthHandoff(req(), d)).status).toBe(404);
    expect(d.createCodeFn).not.toHaveBeenCalled();
  });

  it("mints nothing without a session", async () => {
    const d = deps(null);
    const res = await oauthHandoff(req(), d);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://consumer.app/signed-in?error=oauth_failed");
    expect(d.createCodeFn).not.toHaveBeenCalled();
  });
});
