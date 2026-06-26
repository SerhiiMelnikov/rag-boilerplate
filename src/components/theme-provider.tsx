"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Wraps next-themes with the app's defaults (class strategy, dark by default).
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      {children}
    </NextThemesProvider>
  );
}
