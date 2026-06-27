"use client";

import { useTheme } from "next-themes";

// Minimal light/dark toggle. Restyle freely.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700"
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
