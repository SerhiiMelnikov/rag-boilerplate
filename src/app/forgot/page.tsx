"use client";

import { useState } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/cn";

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
      <AuthCard
        title="Check your email"
        footer={
          <a href="/login" className={cn("text-accent hover:underline", FOCUS_RING)}>
            Back to sign in
          </a>
        }
      >
        <p className="text-xs text-ink-muted">
          If {email} has an account, we sent a link to choose a new password. It expires in 1 hour.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      footer={
        <a href="/login" className={cn("text-accent hover:underline", FOCUS_RING)}>
          Back to sign in
        </a>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Email" required>
          {(control) => <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} {...control} />}
        </Field>
        <Button type="submit" loading={pending}>
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}
