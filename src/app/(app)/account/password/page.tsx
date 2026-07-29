"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

// The endpoint answers 401 for two quite different reasons, and they must not
// share a message. "Invalid credentials" means the current password was wrong;
// "Unauthorized" means the session itself was refused — which since sessions are
// retired on every password change is now routine here (change the password on
// another device and this tab's cookie is already dead). Telling that second user
// "that is not your current password" accuses them of mistyping a password they
// typed correctly, and on a security screen that reads as "someone else changed
// my password".
function messageFor(status: number, error: string | undefined): string {
  if (status === 401) {
    return error === "Invalid credentials"
      ? "That is not your current password."
      : "Your session has expired — sign in again.";
  }
  return error ?? "Could not change the password.";
}

// Changing the password retires every session, this browser's included — see
// sessions_valid_from in requireUser. So a success here MUST end with a sign-out;
// staying on the page would leave a cookie every API call now refuses.
export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        await signOut({ callbackUrl: "/login?passwordChanged=1" });
        return;
      }
      const body: { error?: string } = await res.json().catch(() => ({}));
      setError(messageFor(res.status, body.error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-24 flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Change password</h1>
      <p className="text-sm text-zinc-500">
        This signs you out everywhere, including on this device.
      </p>
      {error && (
        <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      <label className="flex flex-col gap-1 text-sm">
        Current password
        <input
          type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
          className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        New password
        <input
          type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
          className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
        />
      </label>
      <button type="submit" disabled={pending} className="rounded-md bg-zinc-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
        Change password
      </button>
    </form>
  );
}
