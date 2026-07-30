import { setEnvDefaults, type AuthConfig } from "@auth/core";
import Credentials from "@auth/core/providers/credentials";
import type { Provider } from "@auth/core/providers";
import { authorizeCredentials } from "@/lib/auth/credentials";
import { applySessionClaims, jwtCallback } from "@/lib/auth/session-callbacks";
import { oauthProviders, type OAuthUser } from "./providers";
import { oauthSignIn, OAUTH_ERRORS } from "./signin";

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

// The `error` parameter of a URL Auth.js is about to send the browser to, if it
// has one. signin.ts's refusals are URLs of exactly this shape
// ("/login?error=OAuthDomainNotAllowed"), and they reach the redirect callback
// rather than the browser — see it for why.
function errorCode(url: string, baseUrl: string): string | null {
  try {
    // Second argument so a relative refusal URL parses; `url` may also be
    // absolute and foreign, which is fine — only its `error` is ever read, and
    // the redirect callback still returns a target on OUR origin.
    return new URL(url, baseUrl).searchParams.get("error");
  } catch {
    return null;
  }
}

// The codes the redirect callback below is willing to carry into the handoff,
// derived from signin.ts's own table rather than restated here — a fourth
// refusal added there survives the rewrite with no change needed on this side.
//
// Restricted rather than "forward whatever `error` the url has" because
// `redirect` also runs on SUCCESS, with `url` set to the callbackUrl. That value
// originates in a cookie/request parameter, so a forged `callbackUrl=/?error=x`
// would otherwise turn a perfectly good sign-in into a reported failure.
// Auth.js's own error types need no allowance here: its catch block builds
// `${origin}${pages[kind]}?error=<type>` directly (@auth/core/index.js) and
// never calls this callback, so those arrive at the handoff already carrying
// their parameter.
const REFUSAL_CODES: ReadonlySet<string> = new Set(
  Object.values(OAUTH_ERRORS)
    .map((path) => errorCode(path, "https://placeholder.invalid"))
    .filter((code): code is string => code !== null),
);

export function oauthConfig() {
  const handoffMode = Boolean(process.env.OAUTH_SUCCESS_URL);
  return {
    basePath: BASE_PATH,
    session: { strategy: "jwt" as const },

    // "/login" is a page only the full app has: api-only deletes src/app
    // outright. Auth.js routes any AuthError of kind "signIn" — OAuthCallbackError
    // for a provider error or a PKCE/state mismatch, MissingCSRF, and the
    // cancelled-consent path through render.signin — to pages.signIn, and
    // everything else to pages.error, building `${origin}${page}?error=<type>`
    // (@auth/core/index.js's catch block; lib/pages/index.js's render.signin /
    // render.error). In headless mode that was a 302 to a URL that 404s, with
    // the error code stranded on it.
    //
    // Pointing both at the handoff gives those errors the only screen a headless
    // consumer actually has: the handoff forwards the code on to
    // OAUTH_SUCCESS_URL. Full-app behaviour is deliberately untouched.
    pages: handoffMode ? { signIn: HANDOFF_PATH, error: HANDOFF_PATH } : { signIn: "/login" },

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
        // random id @auth/core generated for the profile, which resolves to no row.
        return oauthSignIn(user as OAuthUser & Record<string, unknown>);
      },
      redirect: ({ url, baseUrl }: { url: string; baseUrl: string }) => {
        // Headless: route every successful sign-in through our own handoff
        // endpoint, which trades the cookie for a one-time code.
        if (process.env.OAUTH_SUCCESS_URL) {
          // A refusal reaches us HERE, not the browser: handleAuthorized takes
          // the string signIn returned and passes it straight to this callback
          // (@auth/core/lib/actions/callback/index.js — `return await
          // redirect({ url: authorized, baseUrl: config.url.origin })`), whose
          // return value becomes the 302's Location. Rewriting unconditionally
          // therefore DROPPED the reason: all three of signin.ts's refusals
          // arrived at the handoff indistinguishable from a success, found no
          // session there, and came out as the generic `oauth_failed`. Carrying
          // the code across lets the handoff forward the real one, which is the
          // only reason the taxonomy exists in a build with no /login page.
          const code = errorCode(url, baseUrl);
          if (code && REFUSAL_CODES.has(code)) {
            return `${baseUrl}${HANDOFF_PATH}?${new URLSearchParams({ error: code })}`;
          }
          return `${baseUrl}${HANDOFF_PATH}`;
        }
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

// Everything a bare @auth/core `Auth()` call needs, done once. Two call sites
// exist — src/server/routes.ts's /api/auth/* catch-all and
// src/api/auth/oauth/start/handler.ts — and the four-step sequence they shared
// invited two omissions that were BOTH made at BOTH sites, in two separate tasks:
//
//   * no setEnvDefaults at all. Unlike next-auth's NextAuth() (which calls it
//     internally — node_modules/next-auth/lib/env.js), bare Auth() never derives
//     trustHost or secret from process.env, so every request 500s with
//     UntrustedHost regardless of AUTH_URL or NODE_ENV.
//   * setEnvDefaults without its third argument (suppressBasePathWarning). This
//     config always pins basePath by design (that is what makes one registered
//     redirect URI serve both build modes) and production always sets AUTH_URL —
//     exactly the combination setEnvDefaults calls "redundant" and warns about
//     through logger.warn, which is unconditional rather than gated on
//     config.debug. It would print on every single request. next-auth passes the
//     same `true` for the same reason.
//
// A third call site would have hit both again, so the sequence lives here rather
// than in prose at each site. Next-free, like the rest of this module.
//
// configFn is a parameter so src/api/auth/oauth/start/handler.ts keeps its
// existing config-injection seam for tests.
export function buildAuthConfig(configFn: typeof oauthConfig = oauthConfig): AuthConfig {
  // providers is the only field that needs a cast: oauthConfig() infers it from
  // the array literal above, and naming Auth.js's internal Provider union at the
  // return type would leak next-auth's own typing concerns into every consumer.
  const { providers, ...rest } = configFn();
  const config: AuthConfig = { ...rest, providers: providers as Provider[] };
  setEnvDefaults(process.env, config, true);
  return config;
}
