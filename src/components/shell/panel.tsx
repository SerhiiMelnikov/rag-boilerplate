"use client";

import { usePathname } from "next/navigation";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { cn } from "@/lib/cn";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { useMediaQuery } from "@/components/ui/use-media-query";
import { activeGroup } from "./nav-config";
import { usePanel } from "./panel-context";

const DESKTOP = "(min-width: 1024px)";

// One set of children, one mount: a static column from lg up, an overlay drawer
// below it, never both.
//
// A media query, not `hidden lg:flex`. CSS only hides the aside — React still
// mounts it and runs its children's effects, so below lg the panel's content
// existed twice the moment the drawer opened: one invisible copy and one visible.
//
// The server snapshot is `true` because the layout is desktop-first, which keeps
// hydration on a wide screen stable. The cost is that a phone's first paint still
// renders the aside branch and runs its children's effects once before the store
// corrects and unmounts it. That transient mount is a known residual: closing it
// needs the panel's content to stop fetching on mount, which is where the
// conversation list is headed in the next package.
export function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  const { open, setOpen } = usePanel();
  // Desktop-first server snapshot, matching the layout's CSS.
  const isDesktop = useMediaQuery(DESKTOP, true);
  const pathname = usePathname();
  // The switcher belongs to the panel itself, not to whatever sub-nav a section
  // happens to render inside it: the chat page has no sub-nav at all, and it is
  // still a workspace-scoped route that needs the control.
  const showSwitcher = activeGroup(pathname)?.workspaceScoped === true;

  if (isDesktop) {
    return (
      <aside aria-label={label} className="flex w-panel flex-none flex-col border-r border-border bg-bg">
        {showSwitcher && (
          <div className="border-b border-border p-2">
            <WorkspaceSwitcher />
          </div>
        )}
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
            {showSwitcher && (
              <div className="border-b border-border p-2">
                <WorkspaceSwitcher />
              </div>
            )}
            {children}
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
