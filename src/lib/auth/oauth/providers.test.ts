import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { configuredOAuthProviderIds, oauthProviders } from "./providers";
import type { OAuthUser } from "./providers";

const VARS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const v of VARS) { saved[v] = process.env[v]; delete process.env[v]; }
});
afterEach(() => {
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
});

describe("configuredOAuthProviderIds", () => {
  // The default for every scaffolded project: nothing configured, nothing changes.
  it("is empty when nothing is configured", () => {
    expect(configuredOAuthProviderIds()).toEqual([]);
    expect(oauthProviders()).toEqual([]);
  });

  it("reports each fully configured provider", () => {
    process.env.GOOGLE_CLIENT_ID = "gid";
    process.env.GOOGLE_CLIENT_SECRET = "gsecret";
    expect(configuredOAuthProviderIds()).toEqual(["google"]);
    process.env.GITHUB_CLIENT_ID = "hid";
    process.env.GITHUB_CLIENT_SECRET = "hsecret";
    expect(configuredOAuthProviderIds()).toEqual(["google", "github"]);
    expect(oauthProviders()).toHaveLength(2);
  });

  // Half-configured is a hard failure, not a silent skip: the alternative is an
  // opaque error on the provider's own consent screen, which is miserable to debug.
  it.each([
    ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
  ])("throws naming the missing half when only %s is set", (present, missing) => {
    process.env[present] = "value";
    expect(() => configuredOAuthProviderIds()).toThrow(missing);
  });
});

describe("profile placeholders", () => {
  // Auth.js parks a caller's overrides in `.options` and merges them over the
  // built-in defaults when it initialises the provider — see
  // node_modules/@auth/core/lib/utils/providers.js:12-15, which destructures
  // `options` off and calls merge(defaults, userOptions, …). So `.options.profile`
  // is OUR function; the top-level `.profile` is Auth.js's default, and asserting
  // on that would test the library rather than this module.
  const googleProfile = () => {
    process.env.GOOGLE_CLIENT_ID = "gid";
    process.env.GOOGLE_CLIENT_SECRET = "gsecret";
    const provider = oauthProviders()[0] as { options: { profile: (p: Record<string, unknown>) => OAuthUser } };
    return provider.options.profile;
  };

  // profile() runs before signIn, so it cannot know the real role. It must
  // default to the LEAST privilege: if signIn ever failed to overwrite these,
  // the result must be a powerless session, never a fabricated admin.
  it("maps a Google profile to least-privilege defaults", () => {
    const user = googleProfile()({ sub: "123", email: "a@b.test", email_verified: true, name: "A", picture: "p" });
    expect(user).toMatchObject({ id: "123", email: "a@b.test", emailVerified: true, role: "user", isSuperAdmin: false });
  });

  it("treats an absent Google email_verified as unverified", () => {
    expect(googleProfile()({ sub: "123", email: "a@b.test" }).emailVerified).toBe(false);
  });

  it("treats a GitHub profile with no email as unverified", () => {
    process.env.GITHUB_CLIENT_ID = "hid";
    process.env.GITHUB_CLIENT_SECRET = "hsecret";
    const provider = oauthProviders()[0] as { options: { profile: (p: Record<string, unknown>) => OAuthUser } };
    // Our userinfo.request sets `email` only from a primary VERIFIED row, so a
    // null email means verification could not be established — not merely that
    // the address is missing.
    const user = provider.options.profile({ id: 7, login: "octo", email: null, avatar_url: "a" });
    expect(user).toMatchObject({ id: "7", email: null, emailVerified: false, role: "user", isSuperAdmin: false });
  });
});

describe("GitHub userinfo.request", () => {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

  const githubProvider = () => {
    process.env.GITHUB_CLIENT_ID = "hid";
    process.env.GITHUB_CLIENT_SECRET = "hsecret";
    return oauthProviders()[0] as {
      options: {
        userinfo: { request: (ctx: { tokens: { access_token?: string } }) => Promise<Record<string, unknown>> };
        profile: (p: Record<string, unknown>) => OAuthUser;
      };
    };
  };

  // Spec §7's designated must-pin case, and the whole reason this override
  // exists. The stock provider consults /user/emails ONLY when the profile
  // carries no public email (node_modules/@auth/core/providers/github.js), so a
  // user with a public — possibly unverified — address skips the verification
  // check entirely: exactly the account-takeover path linking-by-email cannot
  // survive. Weaken the assignment to `profile.email ??= …` or wrap it in
  // `if (!profile.email)` and every other test in this suite still passes; this
  // is the only one that goes red.
  it("fetches /user/emails even when the profile already carries an email", async () => {
    const fetchMock = vi.fn(async (url: string | URL) =>
      String(url).includes("/user/emails")
        ? json([{ email: "primary-verified@x.test", primary: true, verified: true }])
        : json({ id: 7, login: "octo", email: "public-unverified@x.test" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const provider = githubProvider();
      const raw = await provider.options.userinfo.request({ tokens: { access_token: "tok" } });
      // The address that survives is the primary VERIFIED one, not the public
      // one /user handed over.
      expect(raw.email).toBe("primary-verified@x.test");
      expect(fetchMock.mock.calls.map((c) => String(c[0]))).toContainEqual(expect.stringContaining("/user/emails"));
      // And it is what reaches signIn, which links by exactly this field.
      expect(provider.options.profile(raw)).toMatchObject({
        email: "primary-verified@x.test",
        emailVerified: true,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // The same override in its refusing direction: a public address plus a primary
  // that GitHub has not verified must yield no email at all, rather than falling
  // back to the one /user volunteered.
  it("drops a public address when no primary verified one exists", async () => {
    const fetchMock = vi.fn(async (url: string | URL) =>
      String(url).includes("/user/emails")
        ? json([{ email: "victim@x.test", primary: true, verified: false }])
        : json({ id: 7, login: "octo", email: "public-unverified@x.test" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const provider = githubProvider();
      const raw = await provider.options.userinfo.request({ tokens: { access_token: "tok" } });
      expect(raw.email).toBeNull();
      expect(provider.options.profile(raw).emailVerified).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // A non-OK response still carries a JSON body (e.g. a rate-limit or "Bad
  // credentials" message), which would otherwise parse into a syntactically
  // valid but bogus profile (id "undefined", shared across every caller hitting
  // this failure mode). The request must reject instead of resolving, so
  // Auth.js turns it into a failed sign-in rather than a silent garbage profile.
  it("rejects when the /user response is not OK", async () => {
    process.env.GITHUB_CLIENT_ID = "hid";
    process.env.GITHUB_CLIENT_SECRET = "hsecret";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "Bad credentials" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = oauthProviders()[0] as {
      options: { userinfo: { request: (ctx: { tokens: { access_token?: string } }) => Promise<unknown> } };
    };
    await expect(provider.options.userinfo.request({ tokens: { access_token: "tok" } })).rejects.toThrow("401");
    vi.unstubAllGlobals();
  });
});
