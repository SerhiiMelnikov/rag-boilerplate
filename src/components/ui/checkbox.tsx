import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { FOCUS_RING } from "./button";

// A native checkbox paints its own box, and no token reaches it: `accent-color`
// only tints the checked fill, so an unchecked box stays the user agent's own
// light square — which is why three screens had white checkboxes sitting on a
// near-black surface. `appearance-none` takes the box away and we draw it, so it
// belongs to the same palette as everything around it.
//
// Still a real <input type="checkbox">: the label association, the keyboard
// behaviour, the form value and the accessibility tree are the browser's, not
// ours. Only the paint changes.
export function Checkbox({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
      <input
        {...props}
        type="checkbox"
        className={cn(
          "peer h-4 w-4 appearance-none rounded border border-border-strong bg-surface",
          "checked:border-accent checked:bg-accent",
          "disabled:cursor-not-allowed disabled:opacity-50",
          FOCUS_RING,
          className,
        )}
      />
      {/* Drawn over the input rather than inside it — an <input> has no children.
          pointer-events-none so the tick never swallows the click. */}
      <Check
        aria-hidden="true"
        className="pointer-events-none absolute h-3 w-3 text-accent-ink opacity-0 peer-checked:opacity-100"
      />
    </span>
  );
}
