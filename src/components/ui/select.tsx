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
        // Anchored, not absolutely positioned: as a child it was clipped by any
        // scrolling ancestor, and at the bottom of one — the pagination bar sits
        // exactly there — it opened downwards into the overflow with its last
        // option unreachable. Anchoring portals it out and flips it above the
        // button when there is no room below, which is what `dropUp` was
        // hand-simulating before.
        //
        // The width variable is `--button-width`, NOT `--anchor-width`: Headless UI
        // sets the former (verified in its listbox source). The latter resolves to
        // nothing, and a width that resolves to nothing is not a build error — the
        // panel simply sizes to its content and nobody is told why.
        //
        // `--anchor-max-height` runs the other direction: it is an input Headless UI's
        // floating logic *reads*, not an output it sets. It applies
        // `maxHeight: min(var(--anchor-max-height, 100vh), <available>px)` as an inline
        // style (internal/floating.js), so we set the variable rather than writing a
        // `max-h-[...]` class -- that class would reference an undefined variable (and
        // even if it resolved, an inline style outranks a class).
        anchor={{ to: "bottom start", gap: 4 }}
        className={cn(
          "z-50 w-[var(--button-width)] rounded border border-border bg-surface p-1 shadow-pop",
          "[--anchor-max-height:18rem] overflow-y-auto",
          "transition duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0",
        )}
      >
        {options.map((option) => (
          // The panel's width is pinned to the button's (`--button-width` above) and
          // must stay that way, so a long option is truncated rather than widened into
          // -- same trade-off `MultiSelect` already makes. `title` recovers the full
          // text on hover; the untruncated text is still the DOM content, so it is
          // still what a screen reader announces.
          <ListboxOption
            key={option}
            value={option}
            title={option}
            className="group flex w-full cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-sm data-[focus]:bg-surface-2"
          >
            <span className="min-w-0 truncate">{option}</span>
            <Check className="h-4 w-4 shrink-0 opacity-0 group-data-[selected]:opacity-100" aria-hidden="true" />
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
}
