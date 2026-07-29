import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
