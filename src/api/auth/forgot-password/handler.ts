import { z } from "zod";
import { findUserForReset, normalizeEmail } from "@/lib/auth/users";
import { domainOf } from "@/lib/auth/seed-domains";
import { createPasswordResetToken, deleteExpiredPasswordResetTokens } from "@/lib/auth/password-reset";
import { resolveLinkBase, buildLink, UntrustedAuthOriginError, type LinkBase } from "@/lib/auth/link-base";
import { sendEmail, EmailNotConfiguredError } from "@/lib/email/sender";
import { passwordResetEmail } from "@/lib/email/templates";
import { consume } from "@/lib/ratelimit/store";

// Anti-abuse only, not admin-tunable — same reasoning and same numbers as
// registerUser's pair. Five per address per hour is generous for a human (a lost
// email, an impatient resend) and useless for a script flooding one inbox.
const RESET_RATE_LIMIT_PER_EMAIL = 5;
// Second bucket, shared by every address at one domain. The per-address bucket
// is evadable for free and bounds nothing on its own: subaddressing means
// "victim+0@company.com" .. "victim+N@company.com" are all delivered to the ONE
// real mailbox on Gmail, Workspace, Fastmail and Proton, yet each variant is a
// distinct string with its own untouched bucket. Deliberately NOT fixed by
// normalising the local part — Gmail also ignores dots, and "+" is a genuinely
// distinct mailbox elsewhere; chasing provider-specific rules is a losing game.
const RESET_DOMAIN_RATE_LIMIT_PER_HOUR = 50;
const RESET_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

// Exactly registerSchema's rule (`z.string().email()`, no trim, no lowercasing).
// It must match: registration stores the address verbatim, so any normalising
// here would look up an address that was never written.
const forgotPasswordSchema = z.object({ email: z.string().email() });

export interface ForgotPasswordDeps {
  findUserFn?: typeof findUserForReset;
  createTokenFn?: typeof createPasswordResetToken;
  sendEmailFn?: typeof sendEmail;
  rateLimitFn?: typeof consume;
  pruneFn?: typeof deleteExpiredPasswordResetTokens;
}

// The ONE response every caller gets, whatever the address turns out to be.
const ACCEPTED = () => Response.json({ status: "reset_sent" });

export async function forgotPassword(request: Request, deps: ForgotPasswordDeps = {}): Promise<Response> {
  const findUserFn = deps.findUserFn ?? findUserForReset;
  const createTokenFn = deps.createTokenFn ?? createPasswordResetToken;
  const sendEmailFn = deps.sendEmailFn ?? sendEmail;
  const rateLimitFn = deps.rateLimitFn ?? consume;
  const pruneFn = deps.pruneFn ?? deleteExpiredPasswordResetTokens;

  // Opportunistic housekeeping, fire-and-forget exactly like registerUser's:
  // this unauthenticated endpoint is the only source of expired reset tokens, so
  // it is the natural place to sweep them, but a sweep must never delay or fail
  // the request riding on it.
  pruneFn().catch((err: unknown) => {
    console.error("forgot-password: prune failed", err);
  });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }
  const email = parsed.data.email;

  // Fail before touching the database at all: if we cannot trust a base for the
  // link, no amount of further processing makes sending one safe.
  let resetBase: LinkBase;
  try {
    resetBase = resolveLinkBase(request, process.env.RESET_URL);
  } catch (err) {
    if (err instanceof UntrustedAuthOriginError) {
      console.error("forgot-password: AUTH_URL is not set in production; refusing to mint a reset link from the request's Host header");
      return Response.json({ error: "Password reset is unavailable: the server is not configured." }, { status: 503 });
    }
    throw err;
  }

  // Both buckets are checked BEFORE the lookup: the limiter's key and verdict
  // depend only on the address string, never on whether a row exists, so a 429
  // can never be correlated with existence. The tighter per-address bucket goes
  // first, so a request it already refuses does not also spend a slot of the
  // domain's shared budget.
  //
  // The KEY is normalised even though the lookup is not, so "Boss@Company.com"
  // and "boss@company.com" share one bucket — same as registerUser.
  // domainOf can return null here (unlike in registerUser, where the allowlist
  // check has already proved it cannot), so the domain bucket is conditional.
  const normalized = normalizeEmail(email);
  const domain = domainOf(normalized);
  const buckets: Array<[string, number]> = [[`reset:email:${normalized}`, RESET_RATE_LIMIT_PER_EMAIL]];
  if (domain) buckets.push([`reset:domain:${domain}`, RESET_DOMAIN_RATE_LIMIT_PER_HOUR]);
  for (const [key, limit] of buckets) {
    const rateLimit = await rateLimitFn(key, limit, RESET_RATE_LIMIT_WINDOW_MS);
    if (!rateLimit.allowed) {
      return Response.json(
        { error: "Too many password reset attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }
  }

  const user = await findUserFn(email);

  // Every "no" path returns the SAME 200 and sends no mail:
  //  - no such address;
  //  - unverified: the row's hash is random filler nothing can authenticate
  //    against (see createUnverifiedUser), so there is no password to reset —
  //    the account is claimed by whoever completes REGISTRATION, and answering
  //    differently here would confirm a pending registration exists;
  //  - blocked: sending mail is pointless and would let a blocked user confirm
  //    they still exist.
  // Note the domain allowlist that registerUser answers 403 to is deliberately
  // NOT applied here: a 403 would leak which domains are allowed and would
  // differ from this uniform 200. An address at a disallowed domain cannot have
  // a verified row anyway, so it lands in the first branch.
  if (!user || !user.emailVerifiedAt || user.blockedAt) return ACCEPTED();

  try {
    const token = await createTokenFn(user.id);
    const { subject, html } = passwordResetEmail(buildLink(resetBase, "/reset", token));
    await sendEmailFn({ to: email, subject, html });
  } catch (err) {
    // A 503 here does reveal that the address was resettable. Accepted, and the
    // same trade registerUser already makes: an operator whose SMTP is down has
    // a bigger problem than this oracle, and swallowing the failure would leave
    // the user waiting forever for mail that is never coming.
    if (err instanceof EmailNotConfiguredError) {
      console.error("forgot-password: SMTP is not configured");
      return Response.json({ error: "Password reset is unavailable: email is not configured." }, { status: 503 });
    }
    console.error("forgot-password: failed to send the reset email", err);
    return Response.json({ error: "Could not send the reset email. Try again later." }, { status: 503 });
  }

  return ACCEPTED();
}
