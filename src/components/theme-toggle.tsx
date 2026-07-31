"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/cn";
import { FOCUS_RING } from "@/components/ui/button";

// Hydration-safe theme toggle: theme is unknown during SSR, so we render a stable
// placeholder until mounted, then show the real icon and label on the client.
//
// Arbitrary button props are forwarded because this renders inside a Headless UI
// MenuItem, which injects role, id, tabIndex and click handling onto its child. A
// component that swallows them is stamped role="none" by the menu's tree-walker.
export function ThemeToggle({
  className = "",
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      {...props}
      type="button"
      aria-label="Toggle theme"
      // Both handlers run: the menu's, which closes the panel and restores focus,
      // and ours. Spreading props alone would silently drop one of the two,
      // depending on which came last.
      onClick={(event) => {
        onClick?.(event);
        setTheme(isDark ? "light" : "dark");
      }}
      className={cn("flex items-center gap-2", FOCUS_RING, className)}
    >
      {mounted ? (
        isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />
      ) : (
        <span className="h-4 w-4" />
      )}
      <span>{mounted ? (isDark ? "Light mode" : "Dark mode") : "Theme"}</span>
    </button>
  );
}
