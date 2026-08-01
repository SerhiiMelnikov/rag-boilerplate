"use client";

import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { FOCUS_RING } from "@/components/ui/button";
import { activeGroup } from "./nav-config";
import { usePanel } from "./panel-context";

// Below lg the panel is an overlay, so it needs a trigger. There is no top bar in
// this design, so this is a thin strip that exists only at those widths.
export function MobileHeader() {
  const pathname = usePathname();
  const { open, setOpen } = usePanel();
  const group = activeGroup(pathname);
  const label = group?.id === "chat" ? "Conversations" : (group?.label ?? "Sections");

  return (
    <div className="flex items-center gap-2 border-b border-border bg-bg px-2 py-1.5 lg:hidden">
      <button
        type="button"
        aria-label={`Open ${label}`}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn("rounded p-2 text-ink-muted hover:bg-surface-2 hover:text-ink", FOCUS_RING)}
      >
        <PanelLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="truncate text-sm font-medium text-ink">{label}</span>
    </div>
  );
}
