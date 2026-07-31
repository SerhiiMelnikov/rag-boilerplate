"use client";

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { cn } from "@/lib/cn";
import { usePanel } from "./panel-context";

// One set of children, two presentations: a static column from lg up, an overlay
// drawer below it. Rendering the children twice would double every fetch the panel
// content performs, so the drawer only mounts while it is open.
export function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  const { open, setOpen } = usePanel();

  return (
    <>
      <aside
        aria-label={label}
        className="hidden w-panel flex-none flex-col border-r border-border bg-bg lg:flex"
      >
        {children}
      </aside>

      <Dialog open={open} onClose={() => setOpen(false)} className="relative z-50 lg:hidden">
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
