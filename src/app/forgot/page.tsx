"use client";

import { useState } from "react";

// Always renders the same confirmation, whatever the endpoint says about the
// address. The API is enumeration-safe by design (one 200 for every case), and a
// UI that revealed more would throw that away.
export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSent(true);
        return;
      }
      const body: { error?: string } = await res.json().catch(() => ({}));
      // 429 and 503 are the only non-200s a well-formed request can get, and both
      // are about us, not about the address.
      setError(body.error ?? "Could not send the reset email. Try again later.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto mt-24 flex w-full max-w-sm flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-zinc-500">
          If {email} has an account, we sent a link to choose a new password. It expires in 1 hour.
        </p>
        <a href="/login" className="text-sm text-zinc-500 underline">Back to sign in</a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-24 flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Reset your password</h1>
      {error && (
        <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
        />
      </label>
      <button type="submit" disabled={pending} className="rounded-md bg-zinc-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
        Send reset link
      </button>
      <a href="/login" className="text-sm text-zinc-500 underline">Back to sign in</a>
    </form>
  );
}
