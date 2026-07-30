import { consumeHandoffCode, deleteExpiredHandoffCodes } from "@/lib/auth/oauth/handoff-codes";
import { getAuthUserById } from "@/lib/auth/users";
import { encodeSessionToken } from "@/lib/auth/session";

export interface ExchangeDeps {
  consumeCodeFn?: typeof consumeHandoffCode;
  getAuthUserFn?: typeof getAuthUserById;
  encodeTokenFn?: typeof encodeSessionToken;
  pruneFn?: typeof deleteExpiredHandoffCodes;
}

// Trades the one-time code from the handoff redirect for a bearer token of the
// same shape POST /api/auth/login returns.
export async function oauthExchange(request: Request, deps: ExchangeDeps = {}): Promise<Response> {
  if (!process.env.OAUTH_SUCCESS_URL) return new Response("Not Found", { status: 404 });

  const consumeCodeFn = deps.consumeCodeFn ?? consumeHandoffCode;
  const getAuthUserFn = deps.getAuthUserFn ?? getAuthUserById;
  const encodeTokenFn = deps.encodeTokenFn ?? encodeSessionToken;
  const pruneFn = deps.pruneFn ?? deleteExpiredHandoffCodes;

  // Opportunistic housekeeping, fire-and-forget and throttled per process, the
  // same shape registerUser and forgot-password use: this is the only place
  // expired codes are noticed, but a sweep must never delay the request on it.
  pruneFn().catch((err: unknown) => {
    console.error("oauth exchange: prune failed", err);
  });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const code = body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
  if (typeof code !== "string" || !code) {
    return Response.json({ error: "code is required" }, { status: 400 });
  }

  // One answer for unknown, expired and already-used alike.
  const userId = await consumeCodeFn(code);
  if (!userId) return Response.json({ error: "Invalid or expired code" }, { status: 400 });

  // Re-read rather than trusting the code: the account may have been blocked or
  // deleted in the seconds since the redirect, and the token's role must be the
  // one the database holds now.
  const user = await getAuthUserFn(userId);
  if (!user || user.blockedAt) return Response.json({ error: "Invalid or expired code" }, { status: 400 });

  const token = await encodeTokenFn({ id: user.id, role: user.role, isSuperAdmin: user.isSuperAdmin });
  return Response.json({ token });
}
