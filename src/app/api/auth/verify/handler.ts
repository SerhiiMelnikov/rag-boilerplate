import { consumeVerificationToken } from "@/lib/auth/verification";

export interface VerifyDeps {
  consumeFn?: typeof consumeVerificationToken;
}

// Redirect rather than render: the user clicked a link in a mail client and belongs
// on the login page either way.
export async function verifyEmail(request: Request, deps: VerifyDeps = {}): Promise<Response> {
  const consumeFn = deps.consumeFn ?? consumeVerificationToken;
  const token = new URL(request.url).searchParams.get("token");
  const base = new URL(request.url).origin;

  // One answer for missing, unknown, expired and already-used alike.
  if (!token) return Response.redirect(`${base}/login?error=invalid_token`, 302);
  const ok = await consumeFn(token);
  return Response.redirect(`${base}/login?${ok ? "verified=1" : "error=invalid_token"}`, 302);
}
