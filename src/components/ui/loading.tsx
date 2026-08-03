import { Spinner } from "./spinner";
import { cn } from "@/lib/cn";

// One loading state for the whole app. Before this there were eleven: bare
// "Loading..." strings, a spinner with the word beside it, a spinner alone, and
// two screens that rendered their loader *instead of* the page header — so the
// title popped in after the data and the page appeared to jump.
//
// The rule this encodes: draw the frame first, load into it. A caller renders its
// PageHeader and its Cards immediately and puts this inside, so what arrives is
// content, not the page itself.
export function Loading({
  label = "Loading",
  inline = false,
  className,
}: {
  /** Announced to screen readers, and shown beside the spinner. */
  label?: string;
  /** For a modal body or a table cell, where a full block of padding would be absurd. */
  inline?: boolean;
  className?: string;
}) {
  // `role="status"` belongs on the wrapper, whose text content IS the label. The
  // spinner is `decorative` for the same reason: left announcing, it would say the
  // same words a second time. An earlier attempt passed `aria-hidden` to Spinner
  // from here — that type-checks (JSX exempts `aria-*` from excess-property
  // checking) and does nothing, because Spinner forwards no props.
  if (inline) {
    return (
      <span role="status" className={cn("inline-flex items-center gap-2 text-sm text-ink-muted", className)}>
        <Spinner decorative />
        {label}
      </span>
    );
  }
  return (
    <div role="status" className={cn("flex items-center justify-center gap-2 px-6 py-14 text-sm text-ink-muted", className)}>
      <Spinner decorative />
      {label}
    </div>
  );
}
