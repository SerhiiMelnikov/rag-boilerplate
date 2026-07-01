"use client";

import { Listbox, ListboxButton, ListboxOptions, ListboxOption } from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";

// A styled, dark-mode-first dropdown built on Headless UI's Listbox. Replaces the
// native <select>, whose open option list is rendered by the OS and can't be
// themed (it looked out of place on the dark admin panel). Keyboard + a11y come
// from Headless UI; `aria-label` is forwarded to the button so screen readers and
// tests can find it by label. Options are absolutely positioned under the button
// (no floating-ui) — fine for the short, fixed provider lists this is used for.
export function Select({ value, onChange, options, ariaLabel, className = "" }: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <Listbox value={value} onChange={onChange} as="div" className={`relative ${className}`}>
      <ListboxButton
        aria-label={ariaLabel}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-left dark:border-zinc-700"
      >
        <span>{value}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
      </ListboxButton>
      <ListboxOptions
        transition
        className="absolute left-0 z-50 mt-1 min-w-full origin-top rounded-md border border-zinc-200 bg-white p-1 shadow-lg transition duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 dark:border-zinc-800 dark:bg-zinc-900"
      >
        {options.map((option) => (
          <ListboxOption
            key={option}
            value={option}
            className="group flex w-full cursor-pointer items-center justify-between gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-sm data-[focus]:bg-zinc-100 dark:data-[focus]:bg-zinc-800"
          >
            <span>{option}</span>
            <Check className="h-4 w-4 opacity-0 group-data-[selected]:opacity-100" aria-hidden="true" />
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
}
