import Credentials from "@auth/core/providers/credentials";
import { authorizeCredentials } from "@/lib/auth/credentials";
import { applySessionClaims, jwtCallback } from "@/lib/auth/session-callbacks";
import { oauthProviders, type OAuthUser } from "./providers";
import { oauthSignIn } from "./signin";

// The Auth.js configuration both runtimes use: the full app spreads it into
// NextAuth() (src/auth.ts) and the api-only build passes it to @auth/core's
// Auth() (src/server/routes.ts). It lives here, next-free, because api-only
// deletes src/auth.ts AND src/auth.config.ts — neither could supply it there.
//
// basePath is pinned so that <origin>/api/auth/callback/<provider> is the
// callback URL in both modes: an operator registers ONE redirect URI with the
// provider whichever kind of deployment they scaffold.
const BASE_PATH = "/api/auth";

// Where a successful sign-in lands in headless mode. Our own origin, so the
// session cookie Auth.js just set actually arrives; the handoff endpoint is what
// performs the cross-origin hop, and it reads its target from the environment
// rather than from anything in the request.
const HANDOFF_PATH = "/api/auth/oauth/handoff";

export function oauthConfig() {
  return {
    basePath: BASE_PATH,
    session: { strategy: "jwt" as const },
    pages: { signIn: "/login" },

    // Concatenated, not substituted: dropping Credentials here would delete
    // email/password sign-in the moment an OAuth provider is configured.
    providers: [
      Credentials({
        credentials: { email: {}, password: {} },
        authorize: (creds) => authorizeCredentials((creds ?? {}) as { email?: unknown; password?: unknown }),
      }),
      ...oauthProviders(),
    ],

    // All four in one object. Spreading this over another config's `callbacks`
    // (as src/auth.ts does with `{ ...authConfig, ...oauthConfig() }`) replaces
    // that key wholesale — object spread does not merge nested objects — so
    // anything omitted here is silently lost. For jwt/session that means every
    // session losing its id, role and sessionIssuedAt, with nothing throwing:
    // users would simply find themselves unable to do anything.
    callbacks: {
      jwt: (params: { token: Record<string, unknown>; user?: unknown }) => jwtCallback(params),
      // Mutates params.session in place and returns it, rather than building a
      // fresh object: a generic "take a session, return a session" signature
      // cannot infer against next-auth's Session (an interface with no index
      // signature), so TypeScript falls back to the bare constraint and the
      // return type silently loses `expires`. See session-callbacks.ts.
      //
      // The <S> type parameter (rather than a concrete annotation) is what
      // makes this compile at BOTH call sites with no next-auth import here:
      // TypeScript instantiates S from whatever the caller's real session type
      // is (next-auth's actual Session in src/auth.ts, a test's plain object in
      // config.test.ts) and returns that exact same S, so the return type
      // always matches what the caller expected — there is no fixed shape to
      // get wrong. applySessionClaims takes `unknown`, so S needs no constraint.
      session: <S>(params: { session: S; token: Record<string, unknown> }): S => {
        applySessionClaims(params.session, params.token);
        return params.session;
      },
      // account is optional/undefined too, matching next-auth's own Account |
      // null | undefined: NextAuth() assigns this callback into NextAuthConfig
      // under strictFunctionTypes, which checks parameters contravariantly, so
      // a narrower parameter type here (missing `undefined`) fails to compile.
      signIn: ({ user, account }: { user: unknown; account?: { provider?: string } | null }) => {
        // Credentials sign-ins are already authorized by authorizeCredentials.
        if (!account || account.provider === "credentials") return true;
        // `user` is passed straight through — NOT spread or cloned. oauthSignIn
        // communicates its result back to the jwt callback by MUTATING this
        // object (the only channel Auth.js offers here without a database
        // adapter — see signin.ts). A copy would receive the mutation instead
        // of the real user, and every OAuth session would silently carry the
        // provider's raw subject id, which resolves to no row.
        return oauthSignIn(user as OAuthUser & Record<string, unknown>);
      },
      redirect: ({ url, baseUrl }: { url: string; baseUrl: string }) => {
        // Headless: route every successful sign-in through our own handoff
        // endpoint, which trades the cookie for a one-time code.
        if (process.env.OAUTH_SUCCESS_URL) return `${baseUrl}${HANDOFF_PATH}`;
        // Otherwise Auth.js's default, reproduced: same-origin only.
        if (url.startsWith("/")) return `${baseUrl}${url}`;
        try {
          if (new URL(url).origin === baseUrl) return url;
        } catch {
          // Not a URL at all; fall through to the safe default.
        }
        return baseUrl;
      },
    },
  };
}
