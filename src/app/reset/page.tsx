import { isPasswordResetTokenValid } from "@/lib/auth/password-reset";
import { AuthCard } from "@/components/auth/auth-card";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/cn";

// Never cache: this must re-check the token on every request, and a cached
// "valid" render for one token must never be served for a different one.
export const dynamic = "force-dynamic";

// The page the emailed link opens. Deliberately read-only: it only ever calls
// isPasswordResetTokenValid, never consumePasswordResetToken. Outlook Safe Links
// and corporate mail scanners GET every URL in every email with no human
// involved, and a consuming GET would burn the user's only reset link before
// they read the mail. Only submitting the form below (POST
// /api/auth/reset-password) consumes the token.
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token || !(await isPasswordResetTokenValid(token))) {
    return (
      <AuthCard
        title="Link expired"
        footer={
          <a href="/forgot" className={cn("text-accent hover:underline", FOCUS_RING)}>
            Request a new link
          </a>
        }
      >
        <p className="text-xs text-ink-muted">
          This password reset link is invalid or has expired. Request a new one.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      <form method="POST" action="/api/auth/reset-password" className="flex flex-col gap-3">
        {error && (
          <Alert tone="danger">Password must be at least 8 characters, and the link must still be valid. Try again.</Alert>
        )}
        <input type="hidden" name="token" value={token} />
        <Field label="New password" required>
          {(control) => <Input type="password" name="password" minLength={8} {...control} />}
        </Field>
        <Button type="submit">Set password</Button>
      </form>
    </AuthCard>
  );
}
