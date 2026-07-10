"use client";

import { Listbox, ListboxButton, ListboxOptions, ListboxOption } from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";

export interface MultiSelectOption { value: string; label: string; hint?: string }

// Multi-select sibling of `Select`, on Headless UI's Listbox with `multiple`.
// The button summarises the selection: the single label, "N selected", or the
// placeholder when empty. Options carry an optional hint (e.g. "everyone").
export function MultiSelect({ value, onChange, options, ariaLabel, placeholder = "none", className = "" }: {
  value: string[];
  onChange: (value: string[]) => void;
  options: MultiSelectOption[];
  ariaLabel: string;
  placeholder?: string;
  className?: string;
}) {
  const summary =
    value.length === 0 ? placeholder
      : value.length === 1 ? (options.find((o) => o.value === value[0])?.label ?? "1 selected")
      : `${value.length} selected`;

  return (
    <Listbox value={value} onChange={onChange} multiple as="div" className={`relative ${className}`}>
      <ListboxButton
        aria-label={ariaLabel}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-left dark:border-zinc-700"
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
      </ListboxButton>
      <ListboxOptions
        transition
        className="absolute left-0 z-50 mt-1 min-w-full origin-top rounded-md border border-zinc-200 bg-white p-1 shadow-lg transition duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 dark:border-zinc-800 dark:bg-zinc-900"
      >
        {options.map((option) => (
          <ListboxOption
            key={option.value}
            value={option.value}
            className="group flex w-full cursor-pointer items-center justify-between gap-3 whitespace-nowrap rounded-md px-2 py-1.5 text-sm data-[focus]:bg-zinc-100 dark:data-[focus]:bg-zinc-800"
          >
            <span className="flex items-baseline gap-2">
              <span>{option.label}</span>
              {option.hint && <span className="text-xs text-zinc-500">{option.hint}</span>}
            </span>
            <Check className="h-4 w-4 opacity-0 group-data-[selected]:opacity-100" aria-hidden="true" />
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
}
