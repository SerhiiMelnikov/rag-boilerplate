"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import type { OAuthProviderId } from "@/lib/auth/oauth/providers";
import { AuthCard } from "@/components/auth/auth-card";
import { PROVIDER_MARKS } from "@/components/auth/provider-icons";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/cn";

const PROVIDER_LABELS: Record<OAuthProviderId, string> = {
  google: "Google",
  github: "GitHub",
};

// Login collects email + password. Register collects an email only — the
// password is chosen later, by whoever clicks the verification link, never
// carried in this request. See the design doc: "Why the password cannot travel
// with the registration".
export function AuthForm({
  mode,
  notice,
  error: initialError,
  providers = [],
}: {
  mode: "login" | "register";
  notice?: string;
  // Set by the server when a redirect carried an ?error= code — Auth.js refuses
  // an OAuth sign-in by redirecting, so the message cannot originate in here.
  error?: string;
  // Passed from the server: this is a client component and cannot read
  // process.env. One flow serves signing in and signing up, so the same buttons
  // appear on both pages.
  providers?: OAuthProviderId[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, setPending] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mode === "register") {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (res.status === 201) {
          setRegistered(true);
          return;
        }
        const body: { error?: string; allowedDomains?: string } = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setError("Email already registered");
        } else if (res.status === 403) {
          const base = body.error ?? "That email domain is not allowed to register.";
          setError(body.allowedDomains ? `${base} Allowed: ${body.allowedDomains}` : base);
        } else if (res.status === 503) {
          setError(body.error ?? "Registration is unavailable. Try again later.");
        } else {
          setError(body.error ?? "Registration failed");
        }
        return;
      }

      const result = await signIn("credentials", { email, password, redirect: false });
      if (!result?.ok) {
        setError("Invalid email or password");
        return;
      }
      router.push("/");
    } finally {
      setPending(false);
    }
  }

  if (mode === "register" && registered) {
    return (
      <AuthCard title="Check your email">
        <p className="text-xs text-ink-muted">
          We sent a link to {email}. Open it to choose your password and finish creating your account.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={mode === "login" ? "Sign in" : "Create account"}
      description={
        mode === "login"
          ? "Ask questions about your team's documents."
          : "Choose your password from the link we email you."
      }
      footer={
        <a href={mode === "login" ? "/register" : "/login"} className={cn("text-accent hover:underline", FOCUS_RING)}>
          {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
        </a>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {notice && <Alert tone="success">{notice}</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}
        {providers.length > 0 && (
          <>
            {providers.map((p) => {
              const Mark = PROVIDER_MARKS[p];
              return (
                <Button key={p} type="button" variant="secondary" onClick={() => signIn(p, { callbackUrl: "/" })}>
                  <Mark className="h-4 w-4" />
                  Continue with {PROVIDER_LABELS[p]}
                </Button>
              );
            })}
            <div className="flex items-center gap-2 text-2xs text-ink-subtle">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
        <Field label="Email" required>
          {(control) => <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} {...control} />}
        </Field>
        {mode === "login" && (
          <>
            <Field label="Password" required>
              {(control) => (
                <Input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} {...control} />
              )}
            </Field>
            <a href="/forgot" className={cn("-mt-1 self-end text-xs text-accent hover:underline", FOCUS_RING)}>
              Forgot your password?
            </a>
          </>
        )}
        <Button type="submit" loading={pending}>
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>
    </AuthCard>
  );
}
