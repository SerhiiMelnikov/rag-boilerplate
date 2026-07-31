"use client";

import { useSyncExternalStore } from "react";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { cn } from "@/lib/cn";
import { usePanel } from "./panel-context";

const DESKTOP = "(min-width: 1024px)";

// A media query, not `hidden lg:flex`. CSS only hides the aside — React still
// mounts it and runs its children's effects, so below lg the panel's content would
// exist twice the moment the drawer opened: one invisible copy and one visible,
// each with its own fetches and its own state.
//
// The server snapshot is `true` because the layout is desktop-first, so hydration
// on a wide screen sees what the server rendered.
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(DESKTOP);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );
}

// One set of children, one mount: a static column from lg up, an overlay drawer
// below it, never both.
export function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  const { open, setOpen } = usePanel();
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <aside aria-label={label} className="flex w-panel flex-none flex-col border-r border-border bg-bg">
        {children}
      </aside>
    );
  }

  return (
    <>
      <Dialog open={open} onClose={() => setOpen(false)} className="relative z-50">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-ink/40 transition-opacity duration-200 data-[closed]:opacity-0"
        />
        <div className="fixed inset-0 flex">
          <DialogPanel
            transition
            className={cn(
              "flex w-panel max-w-[85vw] flex-col border-r border-border bg-bg shadow-pop",
              "transition duration-200 ease-panel data-[closed]:-translate-x-full",
            )}
          >
            <DialogTitle className="sr-only">{label}</DialogTitle>
            {children}
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
