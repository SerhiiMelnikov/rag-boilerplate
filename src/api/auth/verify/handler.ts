import { setPasswordSchema } from "@/lib/validation";
import { consumeVerificationToken } from "@/lib/auth/verification";
import { hashPassword } from "@/lib/auth/password";

export interface SubmitPasswordDeps {
  consumeFn?: typeof consumeVerificationToken;
  hashPasswordFn?: typeof hashPassword;
}

// Handles the "choose your password" form submitted from src/app/verify/page.tsx.
// This is deliberately the ONLY place that consumes a token — the page's GET only
// ever calls isVerificationTokenValid (read-only), so an automated link
// prefetcher (Outlook Safe Links, corporate mail scanners) can never reach here
// on its own; only a human submitting the form can.
export async function submitVerification(request: Request, deps: SubmitPasswordDeps = {}): Promise<Response> {
  const consumeFn = deps.consumeFn ?? consumeVerificationToken;
  const hashPasswordFn = deps.hashPasswordFn ?? hashPassword;
  const base = new URL(request.url).origin;

  const form = await request.formData();
  const rawToken = form.get("token");
  const token = typeof rawToken === "string" ? rawToken : "";

  const parsed = setPasswordSchema.safeParse({ token, password: form.get("password") });
  if (!parsed.success) {
    // The token itself hasn't been touched yet — send them back to the same link
    // so they can retry with a password that meets the rules.
    return Response.redirect(`${base}/verify?token=${encodeURIComponent(token)}&error=1`, 303);
  }

  const passwordHash = await hashPasswordFn(parsed.data.password);
  const ok = await consumeFn(parsed.data.token, passwordHash);
  if (!ok) {
    // One answer for unknown, expired, already-used and already-verified alike —
    // distinguishing them tells a token-guesser which guesses are close.
    return Response.redirect(`${base}/verify?token=${encodeURIComponent(parsed.data.token)}&error=1`, 303);
  }
  return Response.redirect(`${base}/login?verified=1`, 303);
}
