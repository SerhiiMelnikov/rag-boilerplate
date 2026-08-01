"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

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
export function PasswordForm() {
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
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Current password" required>
        {(control) => (
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            {...control}
          />
        )}
      </Field>
      <Field label="New password" required>
        {(control) => (
          <Input
            type="password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            {...control}
          />
        )}
      </Field>
      <Button type="submit" loading={pending}>
        Change password
      </Button>
    </form>
  );
}
