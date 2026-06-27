"use client";

import { signOut } from "next-auth/react";
import { ThemeToggle } from "./theme-toggle";

// Top navigation bar. Admin links only render for admins.
export function AppBar({ email, role }: { email: string; role: "admin" | "user" }) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
      <a href="/" className="font-semibold">RAG Chat</a>
      <div className="flex items-center gap-3 text-sm">
        {role === "admin" && (
          <>
            <a href="/admin/documents" className="underline">Documents</a>
            <a href="/admin/settings" className="underline">Settings</a>
          </>
        )}
        <span className="text-zinc-500">{email}</span>
        <ThemeToggle />
        <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="underline">
          Sign out
        </button>
      </div>
    </header>
  );
}
