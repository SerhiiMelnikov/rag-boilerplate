import { isVerificationTokenValid } from "@/lib/auth/verification";

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
      <div className="mx-auto mt-24 flex w-full max-w-sm flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold">Link expired</h1>
        <p className="text-sm text-zinc-500">
          This verification link is invalid or has expired. Register again to get a new one.
        </p>
        <a href="/register" className="text-sm text-zinc-500 underline">Back to registration</a>
      </div>
    );
  }

  return (
    <form
      method="POST"
      action="/api/auth/verify"
      className="mx-auto mt-24 flex w-full max-w-sm flex-col gap-4 p-6"
    >
      <h1 className="text-xl font-semibold">Choose your password</h1>
      {error && (
        <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          Password must be at least 8 characters. Try again.
        </p>
      )}
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-1 text-sm">
        Password
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
