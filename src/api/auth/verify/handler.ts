import { setPasswordSchema } from "@/lib/validation";
import { consumeVerificationToken } from "@/lib/auth/verification";
import { hashPassword } from "@/lib/auth/password";

export interface SubmitPasswordDeps {
  consumeFn?: typeof consumeVerificationToken;
  hashPasswordFn?: typeof hashPassword;
}

type VerificationOutcome =
  // Schema rejected the input before anything touched the database — echoes
  // back whatever token string arrived (possibly empty) so the caller can
  // re-offer the same link.
  | { status: "invalid_input"; token: string }
  // Schema was fine but consumeFn refused it — unknown, expired, already-used
  // and already-verified all collapse to this ONE outcome so a caller can never
  // tell them apart (see consumeVerificationToken's own comment for why).
  | { status: "invalid_token"; token: string }
  | { status: "verified" };

// The one place that runs the actual verification: validate, hash the chosen
// password, and consume the token. Both the form branch (full-app) and the
// JSON branch (headless) call this so neither can drift from the other's
// validation, single-use-token semantics, or password rules.
async function runVerification(
  rawToken: unknown,
  rawPassword: unknown,
  consumeFn: typeof consumeVerificationToken,
  hashPasswordFn: typeof hashPassword,
): Promise<VerificationOutcome> {
  const token = typeof rawToken === "string" ? rawToken : "";
  const parsed = setPasswordSchema.safeParse({ token, password: rawPassword });
  if (!parsed.success) {
    return { status: "invalid_input", token };
  }

  const passwordHash = await hashPasswordFn(parsed.data.password);
  const ok = await consumeFn(parsed.data.token, passwordHash);
  if (!ok) {
    return { status: "invalid_token", token: parsed.data.token };
  }
  return { status: "verified" };
}

// Handles the "choose your password" form submitted from src/app/verify/page.tsx.
// This is deliberately the ONLY place that consumes a token — the page's GET only
// ever calls isVerificationTokenValid (read-only), so an automated link
// prefetcher (Outlook Safe Links, corporate mail scanners) can never reach here
// on its own; only a human submitting the form can.
//
// Also accepts a JSON body ({ token, password }) for headless (api-only)
// consumers that have no Next `/verify` page to submit a form from — same
// validation, same single-use-token consumption, JSON in and JSON out instead
// of a 303 redirect.
export async function submitVerification(request: Request, deps: SubmitPasswordDeps = {}): Promise<Response> {
  const consumeFn = deps.consumeFn ?? consumeVerificationToken;
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

    const result = await runVerification(rawToken, rawPassword, consumeFn, hashPasswordFn);
    if (result.status === "invalid_input") {
      return Response.json({ error: "Invalid input" }, { status: 400 });
    }
    if (result.status === "invalid_token") {
      return Response.json({ error: "Invalid or expired token" }, { status: 400 });
    }
    return Response.json({ status: "verified" });
  }

  const base = new URL(request.url).origin;
  const form = await request.formData();
  const result = await runVerification(form.get("token"), form.get("password"), consumeFn, hashPasswordFn);

  if (result.status !== "verified") {
    // One answer for invalid input, unknown, expired, already-used and
    // already-verified alike — distinguishing them tells a token-guesser which
    // guesses are close.
    return Response.redirect(`${base}/verify?token=${encodeURIComponent(result.token)}&error=1`, 303);
  }
  return Response.redirect(`${base}/login?verified=1`, 303);
}
