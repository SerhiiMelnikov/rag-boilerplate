import { cn } from "@/lib/cn";
import { FOCUS_RING } from "./button";

export function Input({
  invalid = false,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded border bg-surface px-3 text-md text-ink placeholder:text-ink-subtle",
        "h-[34px] min-h-11 md:min-h-0",
        invalid ? "border-danger" : "border-border-strong",
        FOCUS_RING,
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    />
  );
}
