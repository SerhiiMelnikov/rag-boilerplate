import { setPasswordSchema } from "@/lib/validation";
import { consumePasswordResetToken } from "@/lib/auth/password-reset";
import { hashPassword } from "@/lib/auth/password";

export interface ResetPasswordDeps {
  consumeFn?: typeof consumePasswordResetToken;
  hashPasswordFn?: typeof hashPassword;
}

type ResetOutcome =
  // Schema rejected the input before anything touched the database — echoes back
  // whatever token string arrived so the caller can re-offer the same link.
  | { status: "invalid_input"; token: string }
  // Schema was fine but consumeFn refused it — unknown, expired, already-used,
  // unverified and blocked all collapse to this ONE outcome so a caller can never
  // tell them apart (see consumePasswordResetToken's own comment for why).
  | { status: "invalid_token"; token: string }
  | { status: "reset" };

// The one place that runs the actual reset. Both the form branch (full-app) and
// the JSON branch (headless) call this, so neither can drift from the other's
// validation, single-use-token semantics, or password rules.
async function runReset(
  rawToken: unknown,
  rawPassword: unknown,
  consumeFn: typeof consumePasswordResetToken,
  hashPasswordFn: typeof hashPassword,
): Promise<ResetOutcome> {
  const token = typeof rawToken === "string" ? rawToken : "";
  const parsed = setPasswordSchema.safeParse({ token, password: rawPassword });
  if (!parsed.success) return { status: "invalid_input", token };

  const passwordHash = await hashPasswordFn(parsed.data.password);
  const ok = await consumeFn(parsed.data.token, passwordHash);
  if (!ok) return { status: "invalid_token", token: parsed.data.token };
  return { status: "reset" };
}

// This is the structural sibling of src/api/auth/verify/handler.ts (submitVerification):
// same JSON-or-form branch, same private run* function, same 303-or-JSON shape. That
// resemblance is deliberate, not an oversight — and so is keeping the two handlers
// separate rather than extracting a shared helper. The token modules underneath have
// inverted invariants: consumeVerificationToken only sets a password WHERE
// email_verified_at IS NULL (claiming a fresh, unverified account), while
// consumePasswordResetToken only does it WHERE email_verified_at IS NOT NULL AND
// blocked_at IS NULL (resetting an existing, live one). A shared abstraction would
// permanently couple registration to password reset, so a future change meant for one
// flow could silently reach into the other.
//
// Handles the "choose a new password" form submitted from src/app/reset/page.tsx.
// This is deliberately the ONLY place that consumes a reset token — the page's
// GET only ever calls isPasswordResetTokenValid (read-only), so an automated
// link prefetcher (Outlook Safe Links, corporate mail scanners) can never burn
// the user's link on its own; only a human submitting the form can.
//
// Also accepts a JSON body ({ token, password }) for headless (api-only)
// consumers that have no Next `/reset` page to submit a form from — same
// validation, same single-use consumption, JSON in and JSON out instead of a 303.
export async function resetPassword(request: Request, deps: ResetPasswordDeps = {}): Promise<Response> {
  const consumeFn = deps.consumeFn ?? consumePasswordResetToken;
  const hashPasswordFn = deps.hashPasswordFn ?? hashPassword;

  if (request.headers.get("content-type")?.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const { token: rawToken, password: rawPassword } =
      body && typeof body === "object" ? (body as { token?: unknown; password?: unknown }) : {};

    const result = await runReset(rawToken, rawPassword, consumeFn, hashPasswordFn);
    if (result.status === "invalid_input") return Response.json({ error: "Invalid input" }, { status: 400 });
    if (result.status === "invalid_token") return Response.json({ error: "Invalid or expired token" }, { status: 400 });
    return Response.json({ status: "reset" });
  }

  const base = new URL(request.url).origin;
  const form = await request.formData();
  const result = await runReset(form.get("token"), form.get("password"), consumeFn, hashPasswordFn);

  if (result.status !== "reset") {
    // One answer for invalid input, unknown, expired, already-used, unverified
    // and blocked alike — distinguishing them tells a token-guesser which
    // guesses are close.
    return Response.redirect(`${base}/reset?token=${encodeURIComponent(result.token)}&error=1`, 303);
  }
  return Response.redirect(`${base}/login?reset=1`, 303);
}
