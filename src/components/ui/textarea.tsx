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
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean; autoGrow?: boolean }) {
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

  return (
    <textarea
      {...props}
      onInput={handleInput}
      className={cn(
        "w-full resize-none rounded border bg-surface px-3 py-2 text-md text-ink placeholder:text-ink-subtle",
        invalid ? "border-danger" : "border-border-strong",
        FOCUS_RING,
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    />
  );
}
