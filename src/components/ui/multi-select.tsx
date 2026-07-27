"use client";

import { useState } from "react";
import { Listbox, ListboxButton, ListboxOptions, ListboxOption } from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";

export interface MultiSelectOption { value: string; label: string; hint?: string }

// Multi-select sibling of `Select`, on Headless UI's Listbox with `multiple`. The
// button summarises the selection (the single label, "N selected", or the
// placeholder when empty) and the panel now also carries a filter field, because
// both call sites list every document/workspace in the project and scrolling that
// is not a way to find one. Options carry an optional hint (e.g. "everyone").
//
// This stays on Listbox rather than moving to Headless UI's Combobox (the
// initially preferred route for this feature) for two reasons found while
// prototyping the Combobox version, both reproducible with a from-scratch,
// completely uncustomized `<Combobox>` (i.e. neither is specific to this
// component):
//
// 1. Combobox tracks its button/input/options as three "allowed" DOM refs and,
//    while open, marks everything else as `inert` (aria-hidden + inert, so it is
//    dropped from the accessibility tree and, in real browsers, unclickable) to
//    hide the rest of the page from assistive tech. The walk that computes "the
//    rest of the page" ascends from each allowed ref to <body>, marking sibling
//    elements along the way. Nesting the filter input inside `ComboboxOptions`
//    puts the input's parent chain through the options panel itself, so the walk
//    marks every *other* child of that panel -- i.e. every `ComboboxOption` -- as
//    inert. `Listbox` only tracks two refs (button, options) and has no concept
//    of an input ref, so a plain `<input>` placed inside `ListboxOptions` never
//    triggers this.
// 2. `ComboboxOption` commits a selection on `mousedown`, not `click` (again,
//    reproduced with an unmodified `<Combobox>`), while `ListboxOption` commits on
//    `click`. Real users always fire both, so this is invisible in the browser,
//    but it would have silently broken every existing `fireEvent.click(...option)`
//    in this repo's test suite -- not just this component's, since several other
//    call sites follow the same pattern -- because `fireEvent.click` alone does
//    not synthesize a preceding `mousedown`.
export function MultiSelect({ value, onChange, options, ariaLabel, placeholder = "none", className = "" }: {
  value: string[];
  onChange: (value: string[]) => void;
  options: MultiSelectOption[];
  ariaLabel: string;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const filtered = needle === "" ? options : options.filter((o) => o.label.toLowerCase().includes(needle));

  const summary =
    value.length === 0 ? placeholder
      : value.length === 1 ? (options.find((o) => o.value === value[0])?.label ?? "1 selected")
      : `${value.length} selected`;

  return (
    <Listbox value={value} onChange={onChange} multiple as="div" className={`relative ${className}`}>
      <ListboxButton
        aria-label={ariaLabel}
        // Reopening with the previous query still applied looks like missing options.
        onClick={() => setQuery("")}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-left dark:border-zinc-700"
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
      </ListboxButton>
      <ListboxOptions
        transition
        className="absolute left-0 z-50 mt-1 min-w-full origin-top rounded-md border border-zinc-200 bg-white p-1 shadow-lg transition duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <input
          aria-label={`Filter ${ariaLabel.toLowerCase()}`}
          placeholder="Search..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          // Isolate the filter field from Listbox's own keyboard handling (arrow-key
          // navigation, typeahead, Home/End): that handling listens on this panel and
          // would otherwise fight a plain <input> for every keystroke.
          onKeyDown={(event) => event.stopPropagation()}
          className="mb-1 w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
        />
        {filtered.length === 0 && <div className="px-2 py-1.5 text-sm text-zinc-500">No matches</div>}
        {filtered.map((option) => (
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
