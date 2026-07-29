import { isPasswordResetTokenValid } from "@/lib/auth/password-reset";

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
      <div className="mx-auto mt-24 flex w-full max-w-sm flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold">Link expired</h1>
        <p className="text-sm text-zinc-500">
          This password reset link is invalid or has expired. Request a new one.
        </p>
        <a href="/forgot" className="text-sm text-zinc-500 underline">Request a new link</a>
      </div>
    );
  }

  return (
    <form
      method="POST"
      action="/api/auth/reset-password"
      className="mx-auto mt-24 flex w-full max-w-sm flex-col gap-4 p-6"
    >
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      {error && (
        <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          Password must be at least 8 characters, and the link must still be valid. Try again.
        </p>
      )}
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-1 text-sm">
        New password
        <input
          type="password" name="password" required minLength={8}
          className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
        />
      </label>
      <button type="submit" className="rounded-md bg-zinc-900 px-3 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900">
        Set password
      </button>
    </form>
  );
}
