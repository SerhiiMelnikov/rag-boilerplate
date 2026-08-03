"use client";

import { useRef, useState } from "react";
import { Listbox, ListboxButton, ListboxOptions, ListboxOption } from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { FOCUS_RING } from "./button";

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
//
// Honest trade-off: the filter field is a pointer (mouse/touch) affordance only.
// Headless UI focuses the options panel itself in a post-mount effect right after
// it opens, and Tab is what closes the panel, so there is no keyboard path that
// lands focus in the input -- deliberately not fought here (see the input's
// onKeyDown below and the "no autofocus" note), since racing Headless UI's own
// focus management is fragile. Keyboard users keep Listbox's native typeahead
// (jump to an option by typing its first letters), exactly as before this change,
// so keyboard *operation* is unchanged; they just do not get the new filter.
//
// One thing this does cost, stated plainly rather than glossed: the input is a
// direct child of the panel, which carries role="listbox", and a listbox is
// specified to own only option/group children. So this is invalid ARIA, and a
// screen reader may announce an unexpected textbox inside the list or skip it
// entirely. The exits, if a later change wants them: role="none" on a wrapper
// plus aria-owns, or Headless UI's Combobox once the two blockers documented
// above are gone.
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

  // Reset the filter once the panel is closed, driven off Listbox's actual open
  // state rather than one specific interaction. A click on the button is not the
  // only way to open: Space/ArrowUp/ArrowDown call Headless UI's openListbox()
  // directly (with preventDefault) and never synthesize a click, so a click-only
  // reset would miss them and leak a stale query into the next open. Resetting on
  // a `true` -> `false` transition instead covers every path back to closed --
  // Escape, Tab, an outside click, the button, or picking an option -- with no
  // dependence on which one fired.
  //
  // `open` is only available inside Listbox's render prop (below), and calling it
  // is *Listbox* re-rendering, not this component: Listbox owns that state
  // internally and re-invokes the same `children` function it was already handed,
  // without this component's own function body running again. Two consequences:
  // a `useEffect` here would not fire on every one of those transitions (this
  // component is not the one re-rendering), and calling `setQuery` synchronously
  // from inside the render prop updates a different component while it is
  // mid-render (React logs exactly that warning). `queueMicrotask` sidesteps both:
  // it runs once the current (Listbox) render/commit has finished, so the update
  // lands as a normal, independent one against this component.
  const wasOpenRef = useRef(false);

  return (
    <Listbox value={value} onChange={onChange} multiple as="div" className={`relative ${className}`}>
      {({ open }) => {
        if (wasOpenRef.current && !open) queueMicrotask(() => setQuery(""));
        wasOpenRef.current = open;
        return (
          <>
            <ListboxButton
              aria-label={ariaLabel}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded border border-border-strong bg-surface px-3 py-2 text-left",
                FOCUS_RING,
              )}
            >
              {/* min-w-0: this span is a flex item inside the button (flex,
                  no explicit basis), so without overriding the default
                  min-width:auto it will never shrink below its own text's
                  width -- `truncate`'s overflow:hidden then has nothing to
                  clip against and the text spills past the button instead. */}
              <span className="min-w-0 truncate">{summary}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
            </ListboxButton>
            {/* A bounded column, not a list that grows to whatever the option count
                happens to be: the search box is pinned as a shrink-0 row and only the
                options below it scroll, so filtering never scrolls the field you are
                typing into out of view. `--anchor-max-height` is an input Headless UI's
                own floating logic *reads*, not an output it sets: it applies
                `maxHeight: min(var(--anchor-max-height, 100vh), <available>px)` as an
                inline style (internal/floating.js), so we set the variable here rather
                than writing a `max-h-[...]` class -- that class would either reference
                an undefined variable (dropped at computed-value time) or, if it somehow
                resolved, lose to the inline style anyway. 20rem is about eight rows,
                enough to choose from without the panel swallowing the dialog behind it. */}
            <ListboxOptions
              transition
              // `anchor` rather than absolute positioning: the panel used to be an
              // absolutely-positioned child, so any ancestor with overflow — a modal
              // body, a scrolling page — clipped it, and near the bottom of one it
              // opened into the overflow and could not be reached. Anchoring portals
              // it out and positions it against the button, so it escapes every
              // scroller and flips above the trigger when there is no room below.
              anchor={{ to: "bottom start", gap: 4 }}
              className="z-50 flex [--anchor-max-height:20rem] w-[var(--button-width)] flex-col rounded border border-border bg-surface p-1.5 shadow-pop transition duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0"
            >
              <input
                aria-label={`Filter ${ariaLabel.toLowerCase()}`}
                placeholder="Search..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                // Steal only the keys Listbox's own keydown handler would otherwise
                // swallow as typeahead/navigation: printable single characters
                // (event.key.length === 1, which correctly includes Space -- typing
                // a space must insert a space, not activate the focused option) plus
                // Home/End (which would otherwise jump to the first/last option
                // instead of moving the caret). Everything else -- Escape, Tab, the
                // arrow keys, Enter -- must reach Listbox unmodified: Escape still
                // closes the panel, Tab still leaves it, and letting the arrow
                // keys/Enter through lets a user filter with the keyboard and then
                // arrow/Enter to pick, which is strictly better than blocking them.
                onKeyDown={(event) => {
                  if (event.key.length === 1 || event.key === "Home" || event.key === "End") {
                    event.stopPropagation();
                  }
                }}
                className="mb-1.5 w-full shrink-0 rounded border border-border-strong bg-surface px-2.5 py-1.5 text-md text-ink placeholder:text-ink-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
              <div className="min-h-0 flex-1 overflow-y-auto">
                {filtered.length === 0 && <div className="px-2 py-3 text-center text-md text-ink-subtle">No matches</div>}
                {filtered.map((option) => (
                  <ListboxOption
                    key={option.value}
                    value={option.value}
                    className="group flex w-full cursor-pointer items-center justify-between gap-3 rounded px-2.5 py-2 text-md data-[focus]:bg-surface-2 data-[selected]:text-accent"
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate">{option.label}</span>
                      {option.hint && <span className="shrink-0 text-xs text-ink-subtle">{option.hint}</span>}
                    </span>
                    <Check className="h-4 w-4 shrink-0 opacity-0 group-data-[selected]:opacity-100" aria-hidden="true" />
                  </ListboxOption>
                ))}
              </div>
            </ListboxOptions>
          </>
        );
      }}
    </Listbox>
  );
}
