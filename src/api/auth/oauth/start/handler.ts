import { Auth, setEnvDefaults, skipCSRFCheck } from "@auth/core";
import type { Provider } from "@auth/core/providers";
import { oauthConfig } from "@/lib/auth/oauth/config";
import { configuredOAuthProviderIds, type OAuthProviderId } from "@/lib/auth/oauth/providers";

export interface StartDeps {
  authFn?: typeof Auth;
  configFn?: typeof oauthConfig;
}

// A GET-safe entry point for the headless OAuth flow, and the reason it has to
// exist: Auth.js's own signin action only performs the provider redirect on a
// POST carrying a CSRF token. A GET throws — render.signin in
// @auth/core/lib/pages/index.js rejects outright once a providerId is present.
// A consumer's frontend, deep link or plain <a href> cannot POST a token, so
// without this endpoint the api-only build has no way to begin a sign-in.
//
// We synthesise that POST server-side and pass @auth/core's skipCSRFCheck
// symbol, which its own docs mark as intended for framework authors in exactly
// this position (lib/symbols.js). It makes lib/init.js set
// csrfTokenVerified = true, so the synthesised POST is accepted.
//
// Skipping CSRF here is sound rather than convenient: this endpoint is GET-safe
// BY DESIGN — being reachable from a link is its whole purpose — so it cannot
// carry CSRF protection and still work. The residual exposure is login-CSRF: an
// attacker can bounce a victim to a consent screen, but cannot sign them in as
// somebody else, because consent happens inside the victim's own provider
// session. Auth.js still sets whatever checks the provider is configured for —
// PKCE, state, or both, see the relay comment below — and its own callback
// still validates them; this handler relays every one of them untouched.
export async function oauthStart(request: Request, provider: string, deps: StartDeps = {}): Promise<Response> {
  // Headless-only, matching /api/auth/oauth/handoff and .../exchange: a full-app
  // deployment signs in through its own pages and has no use for this.
  if (!process.env.OAUTH_SUCCESS_URL) return new Response("Not Found", { status: 404 });

  const authFn = deps.authFn ?? Auth;
  const configFn = deps.configFn ?? oauthConfig;

  // Refuse anything not actually configured before Auth.js sees it, or an
  // invented provider name surfaces as an opaque configuration error page.
  if (!configuredOAuthProviderIds().includes(provider as OAuthProviderId)) {
    return new Response("Not Found", { status: 404 });
  }

  const origin = new URL(request.url).origin;
  // No callbackUrl in the body: oauthConfig()'s redirect callback already forces
  // the handoff endpoint whenever OAUTH_SUCCESS_URL is set, and naming it twice
  // would be two places to keep in step.
  const signIn = new Request(`${origin}/api/auth/signin/${provider}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "",
  });

  // providers is the only field that needs a cast: oauthConfig() deliberately
  // types it as unknown[] so this next-free module never has to name Auth.js's
  // internal Provider union (see oauthConfig()'s own comment) — src/auth.ts and
  // src/server/routes.ts cast it the same way for their own runtimes.
  const { providers, ...rest } = configFn();
  const config = { ...rest, providers: providers as Provider[] };

  // Bare Auth() never applies environment defaults itself — only NextAuth()
  // does that internally — so without this call, every request here fails
  // assertConfig with UntrustedHost regardless of AUTH_URL, because trustHost
  // (and secret) are populated exclusively by setEnvDefaults. This was found by
  // actually driving the real @auth/core in Step 5, not assumed: src/server/
  // routes.ts's catch-all calls this too, but this handler builds its own
  // config object and gets no benefit from that separate call.
  //
  // The third argument suppresses Auth.js's "AUTH_URL and basePath are
  // redundant" warning: oauthConfig() pins basePath deliberately (see its own
  // comment), so that advice does not apply here, and logger.warn is
  // unconditional — omitting this would print on every single request.
  setEnvDefaults(process.env, config, true);

  const res = await authFn(signIn, { ...config, skipCSRFCheck });

  // Relay verbatim. Which cookies Auth.js sets here depends on the provider and
  // its configuration — PKCE only for this deployment's Google provider (no
  // redirectProxyUrl configured), PKCE plus state where a configuration calls
  // for both — and its own callback later validates exactly those. That
  // variability is why every Set-Cookie is forwarded rather than any one of
  // them named: naming one would be wrong for some configuration and silently
  // drop whichever cookie is not named.
  const headers = new Headers();
  const location = res.headers.get("location");
  if (location) headers.set("location", location);
  for (const cookie of res.headers.getSetCookie()) headers.append("set-cookie", cookie);
  return new Response(null, { status: res.status, headers });
}
