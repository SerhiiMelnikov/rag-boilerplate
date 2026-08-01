"use client";

import { useCallback } from "react";
import { cn } from "@/lib/cn";
import { FOCUS_RING } from "./button";

export function Textarea({
  invalid = false,
  autoGrow = false,
  className,
  onInput,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
  autoGrow?: boolean;
  // Type-only: React 19 hands `ref` to a function component as an ordinary prop, so
  // the spread below has always reached the DOM node — the props type just never
  // admitted it. Behaviour, autoGrow included, is unchanged for every caller.
  ref?: React.Ref<HTMLTextAreaElement>;
}) {
  // React 19 types onInput on a textarea as InputEventHandler, not
  // FormEventHandler: the event carries `data`, and annotating it as a FormEvent
  // fails to typecheck when forwarded to the caller's own onInput.
  const handleInput = useCallback(
    (event: React.InputEvent<HTMLTextAreaElement>) => {
      if (autoGrow) {
        const el = event.currentTarget;
        // Clear the inline height before measuring: scrollHeight never shrinks
        // below the current height, so without this the box can only grow.
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }
      onInput?.(event);
    },
    [autoGrow, onInput],
  );

  // Field emits aria-invalid on the control it hands back, not a separate
  // `invalid` prop — so a caller that only wires up Field's control (the common
  // path) got correct ARIA and no visual state. aria-invalid is a source of
  // truth alongside the explicit prop, not just the prop.
  const isInvalid = invalid || props["aria-invalid"] === true;

  return (
    <textarea
      {...props}
      onInput={handleInput}
      className={cn(
        "w-full resize-none rounded border bg-surface px-3 py-2 text-md text-ink placeholder:text-ink-subtle",
        // A rows={1} textarea is shorter than a finger; the touch minimum is not
        // optional here just because the control is usually tall.
        "min-h-11 md:min-h-0",
        isInvalid ? "border-danger" : "border-border-strong",
        FOCUS_RING,
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    />
  );
}
