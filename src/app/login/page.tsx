import { AuthForm } from "@/components/auth-form";

// These three redirect targets all land here. `verified=1` has existed since the
// verification flow shipped (registerUser redirects to it) and rendered nothing
// at all until now — the page ignored searchParams entirely.
const NOTICES: Record<string, string> = {
  verified: "Your email is confirmed. Sign in to continue.",
  reset: "Your password has been reset. Sign in with your new password.",
  passwordChanged: "Your password has been changed. Sign in again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const key = Object.keys(NOTICES).find((k) => params[k] === "1");
  return <AuthForm mode="login" notice={key ? NOTICES[key] : undefined} />;
}
