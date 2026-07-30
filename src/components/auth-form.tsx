"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import type { OAuthProviderId } from "@/lib/auth/oauth/providers";

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
      <div className="mx-auto mt-24 flex w-full max-w-sm flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-zinc-500">
          We sent a link to {email}. Open it to choose your password and finish creating your account.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-24 flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">{mode === "login" ? "Sign in" : "Create account"}</h1>
      {notice && (
        <p role="status" className="rounded-md bg-green-100 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      {providers.length > 0 && (
        <>
          {providers.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => signIn(p, { callbackUrl: "/" })}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
            >
              Continue with {PROVIDER_LABELS[p]}
            </button>
          ))}
          <div className="text-center text-xs text-zinc-500">or</div>
        </>
      )}
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
        />
      </label>
      {mode === "login" && (
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
          />
        </label>
      )}
      <button type="submit" disabled={pending} className="rounded-md bg-zinc-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
        {mode === "login" ? "Sign in" : "Create account"}
      </button>
      <a href={mode === "login" ? "/register" : "/login"} className="text-sm text-zinc-500 underline">
        {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
      </a>
      {mode === "login" && (
        <a href="/forgot" className="text-sm text-zinc-500 underline">Forgot password?</a>
      )}
    </form>
  );
}
