import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Replaces oauthSignIn with a mock BEFORE config.ts is imported, so the mock's
// recorded call arguments let us assert object identity (see the by-reference
// test below) without adding a test-only injection parameter to oauthConfig().
//
// Spreads the real module rather than returning only oauthSignIn: config.ts also
// imports OAUTH_ERRORS, and derives the refusal codes its redirect callback will
// carry from it. A hand-written stand-in table here would let the two drift apart
// silently — the tests would keep passing against codes production never emits.
vi.mock("./signin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./signin")>()),
  oauthSignIn: vi.fn(async () => true),
}));

import { oauthConfig } from "./config";
import { oauthSignIn, OAUTH_ERRORS } from "./signin";

const VARS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OAUTH_SUCCESS_URL"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const v of VARS) { saved[v] = process.env[v]; delete process.env[v]; }
  vi.mocked(oauthSignIn).mockClear();
});
afterEach(() => {
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
});

describe("oauthConfig", () => {
  // One registered redirect URI must serve both build modes.
  it("pins basePath so the callback URL is identical in both runtimes", () => {
    expect(oauthConfig().basePath).toBe("/api/auth");
  });

  // The composition hazard: signIn/redirect must not displace jwt/session.
  // Losing them costs every session its id, role and sessionIssuedAt, and
  // nothing about that failure is loud.
  it("carries all four callbacks", () => {
    const cb = oauthConfig().callbacks as Record<string, unknown>;
    for (const key of ["jwt", "session", "signIn", "redirect"]) {
      expect(typeof cb[key], key).toBe("function");
    }
  });

  it("includes the credentials provider alongside any OAuth ones", () => {
    expect(oauthConfig().providers).toHaveLength(1);
    process.env.GOOGLE_CLIENT_ID = "gid";
    process.env.GOOGLE_CLIENT_SECRET = "gsecret";
    expect(oauthConfig().providers).toHaveLength(2);
  });

  describe("signIn callback", () => {
    // oauthSignIn communicates its result to the jwt callback by MUTATING the
    // user object in place — the only channel Auth.js offers between signIn
    // and jwt without a database adapter (see signin.ts's module comment). If
    // this callback ever spread or copied `user` (e.g. `{ ...user }`) before
    // handing it off, the mutation would land on a throwaway: the jwt callback
    // would still see the id @auth/core generated for the profile (a
    // crypto.randomUUID(), not the provider's subject — see providers.ts), and
    // every OAuth session would resolve to no row. A plain "does it return true"
    // test cannot catch that regression — a copy would behave identically from
    // the outside. Only
    // an identity check can, so this asserts that oauthSignIn is called with
    // the EXACT object reference we passed in, via a mocked oauthSignIn and
    // `toBe` (Object.is) on its recorded argument.
    it("hands the user object to oauthSignIn by reference, not a copy", async () => {
      process.env.GOOGLE_CLIENT_ID = "gid";
      process.env.GOOGLE_CLIENT_SECRET = "gsecret";
      const signIn = oauthConfig().callbacks.signIn as (p: {
        user: Record<string, unknown>;
        account: { provider?: string } | null;
      }) => Promise<unknown>;
      const user: Record<string, unknown> = { id: "not-our-uuid", email: "x@y.test", emailVerified: true };

      await signIn({ user, account: { provider: "google" } });

      expect(oauthSignIn).toHaveBeenCalledTimes(1);
      // toBe is reference equality: a spread copy would have equal contents
      // but fail this assertion, which is exactly the regression this guards.
      expect(vi.mocked(oauthSignIn).mock.calls[0][0]).toBe(user);
    });

    it("skips oauthSignIn for credentials sign-ins, which are already authorized", async () => {
      const signIn = oauthConfig().callbacks.signIn as (p: {
        user: Record<string, unknown>;
        account: { provider?: string } | null;
      }) => Promise<unknown>;
      const user: Record<string, unknown> = { id: "u1" };

      const result = await signIn({ user, account: { provider: "credentials" } });

      expect(result).toBe(true);
      expect(oauthSignIn).not.toHaveBeenCalled();
    });
  });

  describe("redirect callback", () => {
    const redirect = () => oauthConfig().callbacks.redirect as (p: { url: string; baseUrl: string }) => Promise<string> | string;

    it("sends the flow to the handoff endpoint when a headless consumer is configured", async () => {
      process.env.OAUTH_SUCCESS_URL = "https://consumer.app/signed-in";
      expect(await redirect()({ url: "/", baseUrl: "https://api.ours.test" }))
        .toBe("https://api.ours.test/api/auth/oauth/handoff");
    });

    it("keeps the default behaviour when no consumer is configured", async () => {
      expect(await redirect()({ url: "/chat", baseUrl: "https://app.test" })).toBe("https://app.test/chat");
    });

    // The default already refuses cross-origin targets; the rewrite must not
    // become a way to reintroduce one from request input.
    it("never follows a cross-origin url from the request", async () => {
      expect(await redirect()({ url: "https://evil.test/steal", baseUrl: "https://app.test" })).toBe("https://app.test");
    });

    // Auth.js never returns the signIn callback's string to the browser: it hands
    // it to THIS callback (handleAuthorized,
    // @auth/core/lib/actions/callback/index.js:393-408). So a rewrite that dropped
    // the query string made all three of signin.ts's refusals arrive at the
    // handoff indistinguishable from a success — and the handoff, finding no
    // session, reported every one of them as the generic `oauth_failed`. The
    // taxonomy existed only for the full app's /login page, which is precisely
    // the page headless mode does not have.
    //
    // The expected codes are spelled out rather than re-derived from the URL under
    // test: recomputing them would restate the implementation and pass against a
    // callback that carried the wrong parameter across.
    it.each([
      [OAUTH_ERRORS.unverified, "OAuthEmailUnverified"],
      [OAUTH_ERRORS.domain, "OAuthDomainNotAllowed"],
      [OAUTH_ERRORS.blocked, "OAuthAccountBlocked"],
    ])("carries the refusal %s to the handoff as %s", async (refusal, code) => {
      process.env.OAUTH_SUCCESS_URL = "https://consumer.app/signed-in";
      const target = new URL(await redirect()({ url: refusal, baseUrl: "https://api.ours.test" }));
      expect(`${target.origin}${target.pathname}`).toBe("https://api.ours.test/api/auth/oauth/handoff");
      expect(target.searchParams.get("error")).toBe(code);
    });

    // This callback also runs on the callbackUrl, which @auth/core takes from a
    // query parameter or a cookie (lib/utils/callback-url.js:5-21) — request
    // input. Only codes signin.ts actually issues may be carried, or a forged
    // ?callbackUrl=/x?error=Whatever turns a perfectly good sign-in into a
    // reported failure at the consumer's screen.
    it("ignores an error code it did not issue", async () => {
      process.env.OAUTH_SUCCESS_URL = "https://consumer.app/signed-in";
      expect(await redirect()({ url: "/x?error=Whatever", baseUrl: "https://api.ours.test" }))
        .toBe("https://api.ours.test/api/auth/oauth/handoff");
    });
  });
});
