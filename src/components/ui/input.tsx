import { cn } from "@/lib/cn";
import { FOCUS_RING } from "./button";

export function Input({
  invalid = false,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  // Field emits aria-invalid on the control it hands back, not a separate
  // `invalid` prop — so a caller that only wires up Field's control (the common
  // path) got correct ARIA and no visual state. aria-invalid is a source of
  // truth alongside the explicit prop, not just the prop.
  const isInvalid = invalid || props["aria-invalid"] === true;
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded border bg-surface px-3 text-md text-ink placeholder:text-ink-subtle",
        "h-[34px] min-h-11 md:min-h-0",
        isInvalid ? "border-danger" : "border-border-strong",
        FOCUS_RING,
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    />
  );
}
