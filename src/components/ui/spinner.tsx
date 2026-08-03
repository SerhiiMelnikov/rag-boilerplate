import { Loader2 } from "lucide-react";

// Small spinning loader. `label` provides an accessible name for screen readers.
//
// `decorative` turns that off: when the spinner sits beside visible text that
// already says what is happening, its own `role="status"` announces the same
// thing a second time. Passing `aria-hidden` from outside does not work — this
// component destructures its props and forwards nothing, and JSX exempts
// `aria-*` from excess-property checking, so such an attempt type-checks and
// silently does nothing. It has to be a real prop.
export function Spinner({
  className = "h-4 w-4",
  label = "Loading",
  decorative = false,
}: {
  className?: string;
  label?: string;
  decorative?: boolean;
}) {
  return (
    <Loader2
      {...(decorative ? { "aria-hidden": true } : { role: "status", "aria-label": label })}
      className={`animate-spin text-current ${className}`}
    />
  );
}
