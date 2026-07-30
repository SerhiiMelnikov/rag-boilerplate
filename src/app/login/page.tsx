import { AuthForm } from "@/components/auth-form";
import { configuredOAuthProviderIds } from "@/lib/auth/oauth/providers";

// These redirect targets all land here. `verified=1` has existed since the
// verification flow shipped (registerUser redirects to it) and rendered nothing
// at all until 0.5.7 — the page ignored searchParams entirely.
const NOTICES: Record<string, string> = {
  verified: "Your email is confirmed. Sign in to continue.",
  reset: "Your password has been reset. Sign in with your new password.",
  passwordChanged: "Your password has been changed. Sign in again.",
};

// The codes src/lib/auth/oauth/signin.ts refuses with. Auth.js can also redirect
// here with codes of its own, so anything unrecognised gets one plain sentence
// rather than a raw library identifier on screen.
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  OAuthEmailUnverified: "That account's email address is not verified with the provider, so it cannot be used to sign in.",
  OAuthDomainNotAllowed: "Your administrator has not allowed that email domain.",
  OAuthAccountBlocked: "That account has been blocked. Contact your administrator.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const noticeKey = Object.keys(NOTICES).find((k) => params[k] === "1");
  const errorCode = typeof params.error === "string" ? params.error : undefined;
  const error = errorCode
    ? (OAUTH_ERROR_MESSAGES[errorCode] ?? "Sign-in failed. Try again.")
    : undefined;

  return (
    <AuthForm
      mode="login"
      notice={noticeKey ? NOTICES[noticeKey] : undefined}
      error={error}
      providers={configuredOAuthProviderIds()}
    />
  );
}
