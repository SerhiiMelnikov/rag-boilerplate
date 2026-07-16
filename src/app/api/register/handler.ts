import { credentialsSchema } from "@/lib/validation";
import { createUser, DuplicateEmailError, findUserForRegistration, resetUnverifiedPassword, deleteUser } from "@/lib/auth/users";
import { getRegistrationSettings } from "@/lib/config/settings-service";
import { isEmailDomainAllowed } from "@/lib/auth/domains";
import { createVerificationToken } from "@/lib/auth/verification";
import { sendEmail, EmailNotConfiguredError } from "@/lib/email/sender";
import { verificationEmail } from "@/lib/email/templates";

export interface RegisterDeps {
  getSettingsFn?: typeof getRegistrationSettings;
  findUserFn?: typeof findUserForRegistration;
  createUserFn?: typeof createUser;
  resetPasswordFn?: typeof resetUnverifiedPassword;
  deleteUserFn?: typeof deleteUser;
  createTokenFn?: typeof createVerificationToken;
  sendEmailFn?: typeof sendEmail;
}

// Absolute link for the email. AUTH_URL is what Auth.js already uses to know where
// it lives; fall back to localhost for development.
function verifyLink(token: string): string {
  const base = process.env.AUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/auth/verify?token=${encodeURIComponent(token)}`;
}

export async function registerUser(request: Request, deps: RegisterDeps = {}): Promise<Response> {
  const getSettingsFn = deps.getSettingsFn ?? getRegistrationSettings;
  const findUserFn = deps.findUserFn ?? findUserForRegistration;
  const createUserFn = deps.createUserFn ?? createUser;
  const resetPasswordFn = deps.resetPasswordFn ?? resetUnverifiedPassword;
  const deleteUserFn = deps.deleteUserFn ?? deleteUser;
  const createTokenFn = deps.createTokenFn ?? createVerificationToken;
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

  // An unverified row confers nothing — no login, no session — so overwriting it is
  // safe, and NOT overwriting it would let one unverified attempt squat an address
  // against its real owner forever.
  let userId: string;
  let created = false;
  if (existing) {
    await resetPasswordFn(existing.id, password);
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
    const token = await createTokenFn(userId);
    const { subject, html } = verificationEmail(verifyLink(token));
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
