import { getSessionFromRequest } from "@/lib/auth/session";
import { createHandoffCode } from "@/lib/auth/oauth/handoff-codes";

export interface HandoffHandlerDeps {
  getSessionFn?: typeof getSessionFromRequest;
  createCodeFn?: typeof createHandoffCode;
}

// Both Auth.js cookie names, so the browser is not left holding a session it can
// no longer use. Expiring both is harmless when only one is present.
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

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

  const getSessionFn = deps.getSessionFn ?? getSessionFromRequest;
  const createCodeFn = deps.createCodeFn ?? createHandoffCode;

  const headers = new Headers();
  for (const name of SESSION_COOKIES) {
    headers.append("set-cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  }

  const session = await getSessionFn(request);
  if (!session) {
    // Nothing to hand over. Say so at the consumer's own screen rather than
    // rendering an error page they never designed.
    headers.set("location", `${successUrl}?error=oauth_failed`);
    return new Response(null, { status: 302, headers });
  }

  const code = await createCodeFn(session.id);
  headers.set("location", `${successUrl}?code=${encodeURIComponent(code)}`);
  return new Response(null, { status: 302, headers });
}
