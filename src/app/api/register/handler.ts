import { registerSchema } from "@/lib/validation";
import { createUnverifiedUser, DuplicateEmailError, findUserForRegistration, deleteUser } from "@/lib/auth/users";
import { getRegistrationSettings } from "@/lib/config/settings-service";
import { isEmailDomainAllowed } from "@/lib/auth/domains";
import { domainOf } from "@/lib/auth/seed-domains";
import { createVerificationToken } from "@/lib/auth/verification";
import { pruneAbandonedRegistrations } from "@/lib/auth/prune";
import { sendEmail, EmailNotConfiguredError } from "@/lib/email/sender";
import { verificationEmail } from "@/lib/email/templates";
import { consume } from "@/lib/ratelimit/store";

// Anti-abuse only — a named constant, not a tunable admin setting. This branch
// already removed one settings-backed rate-limit column (registrationMode's
// sibling, dropped with the open-registration mode itself); re-adding a
// registerRateLimitPerHour column here would be exactly the churn that removal
// was for. Five requests per address per hour is generous for a human (a lost
// email, a typo corrected on the next try, an impatient resend) and useless for
// a script trying to flood one inbox or run the owner's SMTP quota/sender
// reputation into the ground.
const REGISTER_RATE_LIMIT_PER_EMAIL = 5;
const REGISTER_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Second bucket, shared by every address at the same domain — the per-address
// bucket above is evadable for free and does not, on its own, bound anything.
// Subaddressing: "victim+0@company.com" .. "victim+N@company.com" are all
// delivered to the ONE real "victim@company.com" mailbox on Gmail, Google
// Workspace, Fastmail and Proton, yet each variant is a distinct string and so
// gets its own untouched per-address bucket — the mail-bomb this limiter exists
// to stop still lands in full. Enumeration is the same shape: "a@", "b@",
// "c@...@company.com" each get their own bucket too, so total outbound mail
// (and the bounce rate from invented addresses, which is exactly what gets a
// sending domain blacklisted) is otherwise unbounded. Deliberately NOT fixed by
// normalizing the local part: stripping "+" is incomplete (Gmail also ignores
// dots, so "v.i.c.t.i.m@" evades that too) and wrong in general ("+" is a
// genuinely distinct mailbox on some providers) — chasing provider-specific
// rules is a losing game. A shared per-domain cap sidesteps all of that: it
// bounds total mail to one domain no matter what the local part looks like.
//
// 50/hour is generous on purpose: large enough to be invisible against real
// corporate signup volume (e.g. a 40-person new-hire cohort onboarding within
// the same hour) yet small enough that a flood or enumeration script can never
// turn into a real mail bomb or run the owner's sender reputation into the
// ground, no matter how many distinct local parts it invents.
const REGISTER_DOMAIN_RATE_LIMIT_PER_HOUR = 50;

export interface RegisterDeps {
  getSettingsFn?: typeof getRegistrationSettings;
  findUserFn?: typeof findUserForRegistration;
  createUserFn?: typeof createUnverifiedUser;
  deleteUserFn?: typeof deleteUser;
  createTokenFn?: typeof createVerificationToken;
  sendEmailFn?: typeof sendEmail;
  rateLimitFn?: typeof consume;
  pruneFn?: typeof pruneAbandonedRegistrations;
}

// Thrown when we cannot mint a link we would be willing to send. Caught the same
// way as EmailNotConfiguredError: a clean 503 rather than a link we can't trust.
class UntrustedAuthOriginError extends Error {
  constructor() {
    super("AUTH_URL is required in production; refusing to trust the request's Host");
    this.name = "UntrustedAuthOriginError";
  }
}

// The emailed link's base MUST NOT come from the request in production: /api/register
// is not an Auth.js route, so AUTH_TRUST_HOST does not guard it, and a proxy that
// forwards the client's Host verbatim would let an attacker mint a link pointing at
// their own server — capturing the victim's token. Dev has no proxy and no attacker,
// so the request's origin is fine there.
function resolveAuthBase(request: Request): string {
  const configured = process.env.AUTH_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new UntrustedAuthOriginError();
  return new URL(request.url).origin;
}

// Points at the page that asks the clicker to choose a password — NOT an API
// route that consumes the token on GET. See src/app/verify/page.tsx.
function verifyLink(base: string, token: string): string {
  return `${base.replace(/\/$/, "")}/verify?token=${encodeURIComponent(token)}`;
}

export async function registerUser(request: Request, deps: RegisterDeps = {}): Promise<Response> {
  const getSettingsFn = deps.getSettingsFn ?? getRegistrationSettings;
  const findUserFn = deps.findUserFn ?? findUserForRegistration;
  const createUserFn = deps.createUserFn ?? createUnverifiedUser;
  const deleteUserFn = deps.deleteUserFn ?? deleteUser;
  const createTokenFn = deps.createTokenFn ?? createVerificationToken;
  const sendEmailFn = deps.sendEmailFn ?? sendEmail;
  const rateLimitFn = deps.rateLimitFn ?? consume;
  const pruneFn = deps.pruneFn ?? pruneAbandonedRegistrations;

  // Opportunistic housekeeping, fire-and-forget exactly like ratelimit/store.ts's
  // own prune: this unauthenticated endpoint is the only source of expired
  // tokens and abandoned (never-verified) registrations, so it's the natural
  // place to sweep them, but a sweep must never delay or fail the request
  // riding on it — a caller here does not need to know or care that it happened.
  pruneFn().catch((err: unknown) => {
    console.error("register: prune failed", err);
  });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  const { email } = parsed.data;

  // Fail before touching the database at all: if we cannot trust a base for the
  // link, no amount of further processing makes sending one safe.
  let authBase: string;
  try {
    authBase = resolveAuthBase(request);
  } catch (err) {
    if (err instanceof UntrustedAuthOriginError) {
      console.error("register: AUTH_URL is not set in production; refusing to mint a verification link from the request's Host header");
      return Response.json({ error: "Registration is unavailable: the server is not configured." }, { status: 503 });
    }
    throw err;
  }

  const settings = await getSettingsFn();

  // Naming the allowed domains is deliberate: the user must be able to tell why
  // they were refused, and the list is not a secret — it is a corporate domain, and
  // anyone could probe it one address at a time anyway.
  if (!isEmailDomainAllowed(email, settings.allowedEmailDomains)) {
    return Response.json(
      { error: "That email domain is not allowed to register.", allowedDomains: settings.allowedEmailDomains },
      { status: 403 },
    );
  }

  // Throttle per address, not per IP. `x-forwarded-for` is attacker-forgeable —
  // that is why the per-IP limit was dropped in 6a578ca — so an IP-keyed limit
  // only ever bounds requests behind an honest, non-overwriting proxy. The email
  // address has no such hole: it IS the resource being protected, so an
  // attacker who sends a different address is, by definition, not bombing this
  // one. Key it on the normalized address so "Boss@Company.com" and
  // " boss@company.com " share one bucket with "boss@company.com".
  //
  // A second, domain-scoped bucket runs right after it (see
  // REGISTER_DOMAIN_RATE_LIMIT_PER_HOUR above for why the per-address bucket
  // alone is not enough). Two independent buckets checked in a short-circuiting
  // loop — same shape as the chat handler's minute/day pair in
  // src/app/api/chat/handler.ts — so:
  //  - the tighter, more specific per-address bucket is checked FIRST: a
  //    request it already refuses must not also spend a slot of the domain's
  //    shared budget.
  //  - whichever bucket denies, the response is identical (429, no mail, no
  //    user): both checks sit before findUserFn/createUserFn below, so neither
  //    can be distinguished from the other by a caller, and a request refused
  //    by EITHER never reaches the code that would send mail or create a row.
  //
  // Ordering versus the rest of the handler, deliberate on both sides:
  //  - AFTER the domain-allowlist check: a disallowed domain was never going to
  //    be accepted anyway, so it must not spend any of the limiter's budget
  //    (nor a row in the rate_limits table) — the free, DB-less check goes first.
  //  - BEFORE findUserFn (the existence lookup): the limiter's key and verdict
  //    depend only on the address string, never on whether a row exists for
  //    it, so checking it first means a 429 can never be correlated with
  //    existence — the same request for a brand-new address and for an
  //    already-registered one hits the identical checks before either code path
  //    has looked the address up.
  //
  // isEmailDomainAllowed above already parsed this exact address with the same
  // rule domainOf uses (lastIndexOf("@"), rejecting an empty local or domain
  // part) and found a match on the allowlist, so domainOf cannot return null here.
  const domain = domainOf(email)!;
  for (const [key, limit, message] of [
    [
      `register:email:${email.trim().toLowerCase()}`,
      REGISTER_RATE_LIMIT_PER_EMAIL,
      "Too many registration attempts for this address. Try again later.",
    ],
    [
      `register:domain:${domain}`,
      REGISTER_DOMAIN_RATE_LIMIT_PER_HOUR,
      "Too many registration attempts for this domain. Try again later.",
    ],
  ] as const) {
    const rateLimit = await rateLimitFn(key, limit, REGISTER_RATE_LIMIT_WINDOW_MS);
    if (!rateLimit.allowed) {
      return Response.json(
        { error: message },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }
  }

  const existing = await findUserFn(email);
  if (existing?.emailVerifiedAt) {
    return Response.json({ error: "Email already registered" }, { status: 409 });
  }

  // An unverified row confers no login and no password worth protecting — the
  // row's password_hash is a random placeholder nothing can authenticate against
  // (see createUnverifiedUser), and the real password is never decided here at
  // all. So a pre-existing unverified row is never touched: we only ever mint a
  // new token and leave the users row and any earlier token(s) alone. Multiple
  // live tokens for the same address are harmless — none of them carries a
  // password, so every one of them leads to the same "set your password" form,
  // reachable only by whoever controls that mailbox.
  let userId: string;
  let created = false;
  if (existing) {
    userId = existing.id;
  } else {
    try {
      const user = await createUserFn({ email, role: "user" });
      userId = user.id;
      created = true;
    } catch (err) {
      if (err instanceof DuplicateEmailError) {
        return Response.json({ error: "Email already registered" }, { status: 409 });
      }
      throw err;
    }
  }

  try {
    const token = await createTokenFn(userId);
    const { subject, html } = verificationEmail(verifyLink(authBase, token));
    await sendEmailFn({ to: email, subject, html });
  } catch (err) {
    // Roll back only what we created. Deleting a pre-existing row would destroy
    // someone else's pending registration.
    if (created) await deleteUserFn(userId);
    if (err instanceof EmailNotConfiguredError) {
      console.error("register: SMTP is not configured");
      return Response.json({ error: "Registration is unavailable: email is not configured." }, { status: 503 });
    }
    console.error("register: failed to send the verification email", err);
    return Response.json({ error: "Could not send the verification email. Try again later." }, { status: 503 });
  }

  // Deliberately not the user object: the account is not usable yet, and the client
  // must not treat this as a completed registration.
  return Response.json({ status: "verification_sent" }, { status: 201 });
}
