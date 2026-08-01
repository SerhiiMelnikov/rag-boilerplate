"use client";

import { useCallback, useSyncExternalStore } from "react";

// One media query, subscribed properly. `useSyncExternalStore` rather than an effect
// because the answer is read during render: a CSS-only `hidden lg:flex` still mounts
// its children and runs their effects, which is the bug this shape exists to avoid.
//
// `serverFallback` is the snapshot used for SSR and the first paint, before any
// media query can be evaluated.
export function useMediaQuery(query: string, serverFallback: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverFallback,
  );
}
