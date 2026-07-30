import { requireUser, UnauthorizedError } from "@/lib/auth/guards";
import { createHandoffCode } from "@/lib/auth/oauth/handoff-codes";

export interface HandoffHandlerDeps {
  requireUserFn?: typeof requireUser;
  createCodeFn?: typeof createHandoffCode;
}

// Both Auth.js cookie names, so the browser is not left holding a session it can
// no longer use. Expiring both is harmless when only one is present.
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

// Built with URL/searchParams rather than `${successUrl}?${param}=…`, because
// OAUTH_SUCCESS_URL may perfectly reasonably carry a query string of its own
// (https://app.example/callback?src=oauth). Concatenation produces a second `?`
// there, and the consumer reads `src=oauth?code=…` with no `code` parameter at
// all — the handoff silently stops working for that deployment.
function redirectTo(successUrl: string, headers: Headers, param: "code" | "error", value: string): Response {
  const target = new URL(successUrl);
  target.searchParams.set(param, value);
  headers.set("location", target.toString());
  return new Response(null, { status: 302, headers });
}

// The end of the headless OAuth flow. Auth.js has just set a session cookie on
// OUR origin, which a consumer's frontend on another origin cannot read. This
// endpoint — same origin, so the cookie arrives — trades it for a one-time code
// and sends the browser home.
//
// The cross-origin target comes from OAUTH_SUCCESS_URL, never from the request:
// that is what stops an attacker steering the code anywhere. src/lib/auth/oauth/
// config.ts's redirect callback only ever points at this endpoint, on our origin.
export async function oauthHandoff(request: Request, deps: HandoffHandlerDeps = {}): Promise<Response> {
  const successUrl = process.env.OAUTH_SUCCESS_URL;
  // No headless consumer configured: in a full-app deployment the browser keeps
  // its cookie and this endpoint has nothing to do.
  if (!successUrl) return new Response("Not Found", { status: 404 });

  const requireUserFn = deps.requireUserFn ?? requireUser;
  const createCodeFn = deps.createCodeFn ?? createHandoffCode;

  const headers = new Headers();
  for (const name of SESSION_COOKIES) {
    // The `__Secure-` name prefix is a browser-enforced rule, not just a naming
    // convention: a Set-Cookie for a `__Secure-`-prefixed name is rejected
    // outright unless it also carries `Secure`. In production Auth.js sets
    // exactly that cookie (not the bare name), so omitting `Secure` here would
    // make this clear a silent no-op on the one cookie that actually exists —
    // leaving the browser holding a fully valid session alongside the bearer
    // token it just received. The bare name must NOT get `Secure` unconditionally,
    // or the dev-mode (plain http) clear of that cookie silently no-ops instead.
    const secure = name.startsWith("__Secure-") ? "; Secure" : "";
    headers.append("set-cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
  }

  let user;
  try {
    // requireUser, NOT getSessionFromRequest: decrypting the token proves only
    // that this deployment minted it once, never that it is still good. Every
    // check that can retire a session — blocked, deleted, and 0.5.7's
    // sessions_valid_from cut-off — lives in requireUser and nowhere else, and
    // it is next-free, so it works in both build modes.
    //
    // Skipping it would make this endpoint launder a revoked session: it accepts
    // an `Authorization: Bearer` token as readily as the cookie (see
    // getSessionFromRequest), and the exchange it hands off to mints a token
    // with a FRESH sessionIssuedAt — putting a stolen, already-retired session
    // back on the live side of the cut-off, repeatably.
    //
    // The cookie Auth.js has just set passes this: the jwt callback stamps
    // sessionIssuedAt at sign-in.
    user = await requireUserFn(request);
  } catch (err) {
    // A failed lookup (a database outage, say) is not a refusal and must not be
    // reported as one — only UnauthorizedError means "no usable session".
    if (!(err instanceof UnauthorizedError)) throw err;
    // Nothing to hand over. Say so at the consumer's own screen rather than
    // rendering an error page they never designed.
    return redirectTo(successUrl, headers, "error", "oauth_failed");
  }

  const code = await createCodeFn(user.id);
  return redirectTo(successUrl, headers, "code", code);
}
