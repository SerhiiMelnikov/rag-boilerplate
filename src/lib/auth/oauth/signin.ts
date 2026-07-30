import { getUserByEmail, createVerifiedOAuthUser, markEmailVerified } from "@/lib/auth/users";
import { isEmailDomainAllowed } from "@/lib/auth/domains";
import { getRegistrationSettings } from "@/lib/config/settings-service";
import type { OAuthUser } from "./providers";

// Each refusal carries its own reason rather than collapsing into Auth.js's
// generic AccessDenied, which tells a user nothing about what to do next.
// Distinguishing them is not an enumeration leak the way it would be on
// /api/auth/forgot-password: the caller has just proved control of this mailbox
// to the provider, so the account is theirs, and the allowlist is already named
// openly by the registration endpoint's own 403.
export const OAUTH_ERRORS = {
  unverified: "/login?error=OAuthEmailUnverified",
  domain: "/login?error=OAuthDomainNotAllowed",
  blocked: "/login?error=OAuthAccountBlocked",
} as const;

export interface OAuthSignInDeps {
  // Narrower than `typeof getRegistrationSettings`: this function only ever
  // reads `allowedEmailDomains`, and requiring the full settings shape here
  // would force every test's mock to fabricate unrelated SMTP fields it
  // never uses.
  getSettingsFn?: () => Promise<{ allowedEmailDomains: string }>;
  // emailVerifiedAt is part of the projection, not an afterthought: step 4b
  // below cannot tell a confirmed row from an abandoned registration without it.
  findUserFn?: (email: string) => Promise<{ id: string; role: "admin" | "user"; isSuperAdmin: boolean; blockedAt: Date | null; emailVerifiedAt: Date | null } | null>;
  createUserFn?: typeof createVerifiedOAuthUser;
  markVerifiedFn?: typeof markEmailVerified;
}

// Returns true to allow, or a URL string to refuse with a reason.
//
// MUTATES `user`. That is deliberate and is the only channel Auth.js offers
// between signIn and jwt without a database adapter: with no adapter,
// handleLoginOrRegister returns the user object unchanged
// (@auth/core/lib/actions/callback/handle-login.js:24-25), so the object the jwt
// callback receives is literally the one provider.profile() produced — and its
// `id` is the PROVIDER's subject, not ours. Without this reassignment every
// OAuth session would carry an id that resolves to no row, and requireUser would
// reject the user on their very first request.
export async function oauthSignIn(
  user: OAuthUser & Record<string, unknown>,
  deps: OAuthSignInDeps = {},
): Promise<true | string> {
  const getSettingsFn = deps.getSettingsFn ?? getRegistrationSettings;
  const findUserFn = deps.findUserFn ?? (async (email: string) => {
    const row = await getUserByEmail(email);
    return row
      ? { id: row.id, role: row.role, isSuperAdmin: row.isSuperAdmin, blockedAt: row.blockedAt, emailVerifiedAt: row.emailVerifiedAt }
      : null;
  });
  const createUserFn = deps.createUserFn ?? createVerifiedOAuthUser;
  const markVerifiedFn = deps.markVerifiedFn ?? markEmailVerified;

  // 1. The provider must assert the address, or linking by email is a takeover path.
  if (!user.email || !user.emailVerified) return OAUTH_ERRORS.unverified;

  // 2. The same gate registration enforces. Without it OAuth would be a way
  //    around the allowlist rather than another door through it.
  const settings = await getSettingsFn();
  if (!isEmailDomainAllowed(user.email, settings.allowedEmailDomains)) return OAUTH_ERRORS.domain;

  // 3. Existing row? Link to it — unless it is blocked.
  const existing = await findUserFn(user.email);
  if (existing?.blockedAt) return OAUTH_ERRORS.blocked;

  // 4. Only now create. Every refusal above runs first, so a rejected sign-in
  //    never leaves a row squatting the address.
  const row = existing ?? (await createUserFn(user.email));

  // 4b. A row reached by LINKING may be an abandoned credentials registration —
  //     someone who started with email/password a minute ago and then clicked
  //     "Continue with Google" instead. It is unverified, and nothing further in
  //     this flow would ever confirm it: requireUser does not look at
  //     emailVerifiedAt, so the account works perfectly right up until
  //     pruneAbandonedRegistrations DELETEs it 24 hours later, cascading away
  //     the user's conversations and workspace grants. Until then
  //     authorizeCredentials refuses it and forgot-password no-ops on it, so its
  //     owner can neither sign in with a password nor set one.
  //
  //     The provider has just asserted control of this exact mailbox, which is
  //     the same evidence the verification link carries — so confirm it here.
  //     Only when it is actually null: markEmailVerified is scoped the same way,
  //     but skipping the call keeps a repeat sign-in from spending a write.
  if (existing && existing.emailVerifiedAt === null) await markVerifiedFn(existing.id);

  // 5. Hand our identity to the jwt callback. See the mutation note above.
  user.id = row.id;
  user.role = row.role;
  user.isSuperAdmin = row.isSuperAdmin;
  return true;
}
