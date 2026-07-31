import { isVerificationTokenValid } from "@/lib/auth/verification";
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
// isVerificationTokenValid, never consumeVerificationToken. Outlook Safe Links
// and corporate mail scanners GET every URL in every email with no human
// involved, and a consuming GET would let one of them complete or destroy a
// registration. Only submitting the form below (POST /api/auth/verify) consumes
// the token — see src/app/api/auth/verify/handler.ts.
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token || !(await isVerificationTokenValid(token))) {
    return (
      <AuthCard
        title="Link expired"
        footer={
          <a href="/register" className={cn("text-accent hover:underline", FOCUS_RING)}>
            Back to registration
          </a>
        }
      >
        <p className="text-xs text-ink-muted">
          This verification link is invalid or has expired. Register again to get a new one.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose your password">
      <form method="POST" action="/api/auth/verify" className="flex flex-col gap-3">
        {error && <Alert tone="danger">Password must be at least 8 characters. Try again.</Alert>}
        <input type="hidden" name="token" value={token} />
        <Field label="Password" required>
          {(control) => <Input type="password" name="password" minLength={8} {...control} />}
        </Field>
        <Button type="submit">Set password</Button>
      </form>
    </AuthCard>
  );
}
