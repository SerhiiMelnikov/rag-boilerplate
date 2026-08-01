"use client";

import { Listbox, ListboxButton, ListboxOptions, ListboxOption } from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { FOCUS_RING } from "./button";

// A styled, dark-mode-first dropdown built on Headless UI's Listbox. Replaces the
// native <select>, whose open option list is rendered by the OS and can't be
// themed (it looked out of place on the dark admin panel). Keyboard + a11y come
// from Headless UI; `aria-label` is forwarded to the button so screen readers and
// tests can find it by label. Options are absolutely positioned under the button
// (no floating-ui) — fine for the short, fixed provider lists this is used for.
export function Select({ value, onChange, options, ariaLabel, className = "", compact = false }: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  ariaLabel: string;
  className?: string;
  // Compact tightens the metrics, not the touch minimum: the only compact instance
  // is the workspace switcher at the top of the panel, which is the primary
  // workspace control inside the mobile drawer and needs the same 44px target
  // every other touch control gets. It only shrinks below that on desktop, same
  // as the default size.
  compact?: boolean;
}) {
  const buttonSize = compact
    ? "h-[30px] min-h-11 px-2 text-sm md:min-h-0"
    : "h-[34px] min-h-11 px-3 text-md md:min-h-0";
  return (
    <Listbox value={value} onChange={onChange} as="div" className={`relative ${className}`}>
      <ListboxButton
        aria-label={ariaLabel}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded border border-border-strong bg-surface text-left",
          buttonSize,
          FOCUS_RING,
        )}
      >
        <span>{value}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
      </ListboxButton>
      <ListboxOptions
        transition
        className="absolute left-0 z-50 mt-1 min-w-full origin-top rounded border border-border bg-surface p-1 shadow-pop transition duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0"
      >
        {options.map((option) => (
          <ListboxOption
            key={option}
            value={option}
            className="group flex w-full cursor-pointer items-center justify-between gap-2 whitespace-nowrap rounded px-2 py-1.5 text-sm data-[focus]:bg-surface-2"
          >
            <span>{option}</span>
            <Check className="h-4 w-4 opacity-0 group-data-[selected]:opacity-100" aria-hidden="true" />
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
}
