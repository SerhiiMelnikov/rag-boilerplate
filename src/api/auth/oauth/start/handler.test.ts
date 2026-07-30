import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { oauthStart } from "./handler";

const req = () => new Request("http://api.test/api/auth/oauth/start/google");

// A stand-in for @auth/core's Auth(): records what it was handed and answers
// the way the real signin action does for this deployment's Google provider —
// a 302 plus the callback-url and PKCE cookies its own callback will need.
// Verified against the real @auth/core (see task-11-report.md's Step 5): with
// no redirectProxyUrl configured, Google's checks default to ["pkce"] only, so
// no authjs.state cookie is ever set here — a fake that invented one would
// teach the next reader something false about what this endpoint relays.
function fakeAuth() {
  const calls: Array<{ url: string; method: string; config: Record<string, unknown> }> = [];
  const fn = vi.fn(async (request: Request, config: Record<string, unknown>) => {
    calls.push({ url: request.url, method: request.method, config });
    const headers = new Headers({ location: "https://accounts.google.com/o/oauth2/v2/auth?code_challenge=abc" });
    headers.append("set-cookie", "authjs.callback-url=http%3A%2F%2Fapi.test; Path=/; HttpOnly; SameSite=Lax");
    headers.append("set-cookie", "authjs.pkce.code_verifier=xyz; Path=/; HttpOnly; SameSite=Lax");
    return new Response(null, { status: 302, headers });
  });
  return { fn, calls };
}

const deps = (auth: ReturnType<typeof fakeAuth>) => ({
  authFn: auth.fn as unknown as typeof import("@auth/core").Auth,
  configFn: () => ({ providers: [] }) as unknown as ReturnType<typeof import("@/lib/auth/oauth/config").oauthConfig>,
});

const saved = { url: process.env.OAUTH_SUCCESS_URL, gid: process.env.GOOGLE_CLIENT_ID, gsec: process.env.GOOGLE_CLIENT_SECRET };
beforeEach(() => {
  process.env.OAUTH_SUCCESS_URL = "https://consumer.app/signed-in";
  process.env.GOOGLE_CLIENT_ID = "gid";
  process.env.GOOGLE_CLIENT_SECRET = "gsecret";
});
afterEach(() => {
  for (const [k, v] of [["OAUTH_SUCCESS_URL", saved.url], ["GOOGLE_CLIENT_ID", saved.gid], ["GOOGLE_CLIENT_SECRET", saved.gsec]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("oauthStart", () => {
  // The reason the endpoint exists: one GET must become the provider redirect,
  // because a consumer's link or deep link cannot POST a CSRF token.
  it("turns a GET into the provider redirect", async () => {
    const auth = fakeAuth();
    const res = await oauthStart(req(), "google", deps(auth));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("accounts.google.com");
  });

  // Auth.js only performs the redirect on a POST to the signin action; a GET
  // throws UnknownAction. So the request we synthesise must be a POST.
  it("drives Auth.js with a POST to the signin action", async () => {
    const auth = fakeAuth();
    await oauthStart(req(), "google", deps(auth));
    expect(auth.calls).toHaveLength(1);
    expect(auth.calls[0].method).toBe("POST");
    expect(auth.calls[0].url).toBe("http://api.test/api/auth/signin/google");
  });

  // Without skipCSRFCheck the synthesised POST is rejected, because no browser
  // supplied a CSRF token — there was no form.
  it("passes skipCSRFCheck so the synthesised POST is accepted", async () => {
    const auth = fakeAuth();
    await oauthStart(req(), "google", deps(auth));
    expect(auth.calls[0].config.skipCSRFCheck).toBeDefined();
  });

  // Whichever cookies Auth.js sets here are what its own callback validates
  // later; dropping even one breaks the flow at the callback with an error
  // that names none of this. The property under test is "every cookie is
  // relayed" — not which ones exist, since that varies by provider and
  // configuration (see fakeAuth's comment) — hence asserting the count plus
  // both names the fake actually produced, rather than assuming a fixed shape.
  it("relays every cookie Auth.js set", async () => {
    const auth = fakeAuth();
    const res = await oauthStart(req(), "google", deps(auth));
    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies.join("; ")).toContain("authjs.callback-url=");
    expect(cookies.join("; ")).toContain("authjs.pkce.code_verifier=");
  });

  // Bare Auth() never applies environment defaults itself (only NextAuth()
  // does that internally) — trustHost is populated exclusively by
  // setEnvDefaults(). Without that call every real request fails assertConfig
  // with UntrustedHost, which is exactly what Step 5's real-@auth/core run
  // caught (see task-11-report.md). Pinned to the config actually handed to
  // authFn, since that is the one assertConfig sees.
  it("applies environment defaults so trustHost is set when AUTH_URL is configured", async () => {
    const savedAuthUrl = process.env.AUTH_URL;
    process.env.AUTH_URL = "https://app.example";
    try {
      const auth = fakeAuth();
      await oauthStart(req(), "google", deps(auth));
      expect(auth.calls[0].config.trustHost).toBeTruthy();
    } finally {
      if (savedAuthUrl === undefined) delete process.env.AUTH_URL;
      else process.env.AUTH_URL = savedAuthUrl;
    }
  });

  // Headless-only, matching handoff and exchange.
  it("is absent when no headless consumer is configured", async () => {
    delete process.env.OAUTH_SUCCESS_URL;
    const auth = fakeAuth();
    expect((await oauthStart(req(), "google", deps(auth))).status).toBe(404);
    expect(auth.fn).not.toHaveBeenCalled();
  });

  // An unconfigured or invented provider must not reach Auth.js, where it would
  // surface as an opaque configuration error.
  it("refuses a provider that is not configured", async () => {
    const auth = fakeAuth();
    expect((await oauthStart(req(), "github", deps(auth))).status).toBe(404);
    expect((await oauthStart(req(), "not-a-provider", deps(auth))).status).toBe(404);
    expect(auth.fn).not.toHaveBeenCalled();
  });
});
