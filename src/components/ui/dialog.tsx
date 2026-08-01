"use client";

import {
  Dialog as HeadlessDialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Description,
} from "@headlessui/react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { FOCUS_RING } from "./button";

const SIZES = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl" } as const;

// The one modal shell. Five modals each hand-rolled backdrop, panel, transition and
// title markup before this existed, which is why their paddings and animations
// disagreed. Headless UI supplies the focus trap, the Escape handling and the
// aria-modal wiring.
export function Dialog({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: keyof typeof SIZES;
  children: React.ReactNode;
}) {
  return (
    <HeadlessDialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-ink/40 transition-opacity duration-200 data-[closed]:opacity-0"
      />
      <div className="fixed inset-0 flex items-end justify-center p-0 sm:items-center sm:p-4">
        <DialogPanel
          transition
          className={cn(
            "flex max-h-[90vh] w-full flex-col rounded-t-lg border border-border bg-surface shadow-pop",
            "transition-all duration-200 ease-panel data-[closed]:translate-y-2 data-[closed]:opacity-0",
            "sm:rounded-lg sm:data-[closed]:translate-y-0 sm:data-[closed]:scale-95",
            SIZES[size],
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <DialogTitle className="text-md font-semibold text-ink">{title}</DialogTitle>
              {description && (
                <Description className="mt-0.5 text-xs text-ink-muted">{description}</Description>
              )}
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className={cn("rounded p-1 text-ink-subtle hover:bg-surface-2 hover:text-ink", FOCUS_RING)}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        </DialogPanel>
      </div>
    </HeadlessDialog>
  );
}
