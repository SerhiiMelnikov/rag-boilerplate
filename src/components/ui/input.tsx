import { cn } from "@/lib/cn";
import { FOCUS_RING } from "./button";

export function Input({
  invalid = false,
  compact = false,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  // Tighter metrics for a control inside a table row, where the standard height
  // makes the row jump the moment it becomes editable. Mirrors Select's own
  // `compact`, including keeping the 44px touch minimum until `md` — density is
  // a desktop concession, never a reason to shrink a target under a finger.
  compact?: boolean;
}) {
  // Field emits aria-invalid on the control it hands back, not a separate
  // `invalid` prop — so a caller that only wires up Field's control (the common
  // path) got correct ARIA and no visual state. aria-invalid is a source of
  // truth alongside the explicit prop, not just the prop.
  const isInvalid = invalid || props["aria-invalid"] === true;
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded border bg-surface text-ink placeholder:text-ink-subtle",
        compact ? "h-[30px] min-h-11 px-2 text-sm md:min-h-0" : "h-[34px] min-h-11 px-3 text-md md:min-h-0",
        isInvalid ? "border-danger" : "border-border-strong",
        FOCUS_RING,
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    />
  );
}
