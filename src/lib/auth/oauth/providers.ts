import Google from "@auth/core/providers/google";
import GitHub from "@auth/core/providers/github";
import { fetchVerifiedPrimaryEmail } from "./github-email";

// Imported from @auth/core, NOT next-auth: this module is next-free, and the
// api-only build prunes next-auth entirely. next-auth/providers/* is only a
// re-export of these same objects, so the full app is unaffected.

export type OAuthProviderId = "google" | "github";

// The one user shape both providers map to, so signin.ts has no provider-specific
// branching. Two fields are placeholders rather than facts:
//
//   `id` is the PROVIDER's subject here, not ours;
//   `role`/`isSuperAdmin` are least-privilege defaults, because profile() runs
//   BEFORE signIn and we have not looked this person up yet.
//
// signIn replaces all three from our own row. They are present at all only
// because src/types/next-auth.d.ts declares role and isSuperAdmin as required on
// Auth.js's User, which profile()'s return type must satisfy. Writing "user" and
// false — never "admin"/true — means that if the replacement ever failed to
// happen, the result is a powerless session rather than a fabricated admin.
export interface OAuthUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
  role: "admin" | "user";
  isSuperAdmin: boolean;
}

const ENV: Record<OAuthProviderId, { id: string; secret: string }> = {
  google: { id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
  github: { id: "GITHUB_CLIENT_ID", secret: "GITHUB_CLIENT_SECRET" },
};

function credentials(provider: OAuthProviderId): { clientId: string; clientSecret: string } | null {
  const { id, secret } = ENV[provider];
  const clientId = process.env[id];
  const clientSecret = process.env[secret];
  if (!clientId && !clientSecret) return null;
  // Half-configured throws rather than silently disabling the provider: the
  // failure it otherwise produces surfaces on the provider's consent screen,
  // far from anything that names the real cause.
  if (!clientId) throw new Error(`${id} is required when ${secret} is set.`);
  if (!clientSecret) throw new Error(`${secret} is required when ${id} is set.`);
  return { clientId, clientSecret };
}

export function configuredOAuthProviderIds(): OAuthProviderId[] {
  return (Object.keys(ENV) as OAuthProviderId[]).filter((p) => credentials(p) !== null);
}

function googleProvider(creds: { clientId: string; clientSecret: string }) {
  return Google({
    ...creds,
    profile(profile: Record<string, unknown>): OAuthUser {
      return {
        id: String(profile.sub),
        email: typeof profile.email === "string" ? profile.email : null,
        name: typeof profile.name === "string" ? profile.name : null,
        image: typeof profile.picture === "string" ? profile.picture : null,
        // Google states this outright, which is what makes linking-by-email safe here.
        emailVerified: profile.email_verified === true,
        // Least-privilege placeholder: signIn overwrites this from our own row.
        role: "user",
        isSuperAdmin: false,
      };
    },
  });
}

function githubProvider(creds: { clientId: string; clientSecret: string }) {
  return GitHub({
    ...creds,
    userinfo: {
      url: "https://api.github.com/user",
      // Replaces the stock request, which only consults /user/emails when the
      // profile carries no public email and then ignores `verified` — see
      // github-email.ts for why that is unsafe here. We always ask, and accept
      // nothing but a primary verified address.
      async request({ tokens }: { tokens: { access_token?: string } }) {
        const token = tokens.access_token ?? "";
        const res = await fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${token}`, "User-Agent": "rag-boilerplate" },
        });
        // A non-OK response (rate limit, transient error, a token that died
        // between the code exchange and here) still carries a JSON body
        // (e.g. { message: "Bad credentials" }), which res.json() would
        // happily parse into a syntactically valid but semantically bogus
        // profile — see fetchVerifiedPrimaryEmail's own res.ok check, which
        // this mirrors. Throwing here fails the sign-in loudly instead of
        // silently minting an "undefined" subject id.
        if (!res.ok) throw new Error(`GitHub /user request failed with status ${res.status}`);
        const profile = (await res.json()) as Record<string, unknown>;
        profile.email = await fetchVerifiedPrimaryEmail(token);
        return profile;
      },
    },
    profile(profile: Record<string, unknown>): OAuthUser {
      const email = typeof profile.email === "string" ? profile.email : null;
      return {
        id: String(profile.id),
        email,
        name: typeof profile.name === "string" ? profile.name : String(profile.login ?? ""),
        image: typeof profile.avatar_url === "string" ? profile.avatar_url : null,
        // The userinfo request above sets `email` only from a primary verified
        // row, so its presence IS the verification.
        emailVerified: email !== null,
        // Least-privilege placeholder: signIn overwrites this from our own row.
        role: "user",
        isSuperAdmin: false,
      };
    },
  });
}

export function oauthProviders(): unknown[] {
  const out: unknown[] = [];
  const google = credentials("google");
  if (google) out.push(googleProvider(google));
  const github = credentials("github");
  if (github) out.push(githubProvider(github));
  return out;
}
