import { credentialsSchema } from "@/lib/validation";
import { createUser, DuplicateEmailError, findUserForRegistration, deleteUser } from "@/lib/auth/users";
import { hashPassword } from "@/lib/auth/password";
import { getRegistrationSettings } from "@/lib/config/settings-service";
import { isEmailDomainAllowed } from "@/lib/auth/domains";
import { createVerificationToken } from "@/lib/auth/verification";
import { sendEmail, EmailNotConfiguredError } from "@/lib/email/sender";
import { verificationEmail } from "@/lib/email/templates";

export interface RegisterDeps {
  getSettingsFn?: typeof getRegistrationSettings;
  findUserFn?: typeof findUserForRegistration;
  createUserFn?: typeof createUser;
  deleteUserFn?: typeof deleteUser;
  createTokenFn?: typeof createVerificationToken;
  hashPasswordFn?: typeof hashPassword;
  sendEmailFn?: typeof sendEmail;
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

function verifyLink(base: string, token: string): string {
  return `${base.replace(/\/$/, "")}/api/auth/verify?token=${encodeURIComponent(token)}`;
}

export async function registerUser(request: Request, deps: RegisterDeps = {}): Promise<Response> {
  const getSettingsFn = deps.getSettingsFn ?? getRegistrationSettings;
  const findUserFn = deps.findUserFn ?? findUserForRegistration;
  const createUserFn = deps.createUserFn ?? createUser;
  const deleteUserFn = deps.deleteUserFn ?? deleteUser;
  const createTokenFn = deps.createTokenFn ?? createVerificationToken;
  const hashPasswordFn = deps.hashPasswordFn ?? hashPassword;
  const sendEmailFn = deps.sendEmailFn ?? sendEmail;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  const { email, password } = parsed.data;

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

  const existing = await findUserFn(email);
  if (existing?.emailVerifiedAt) {
    return Response.json({ error: "Email already registered" }, { status: 409 });
  }

  // An unverified row confers no login and no session on its own — but it DOES
  // confer a live token already sitting in that address's inbox. Overwriting
  // users.passwordHash here would retarget every link already in flight to
  // whichever password overwrote it last (account pre-hijacking). So a
  // pre-existing unverified row is never touched: we only ever mint a new token,
  // carrying the new password, and leave the old token(s) and the users row alone.
  // Whoever clicks their own link gets their own password — see
  // createVerificationToken/consumeVerificationToken.
  const passwordHash = await hashPasswordFn(password);
  let userId: string;
  let created = false;
  if (existing) {
    userId = existing.id;
  } else {
    try {
      const user = await createUserFn({ email, password, role: "user" });
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
    const token = await createTokenFn(userId, passwordHash);
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
