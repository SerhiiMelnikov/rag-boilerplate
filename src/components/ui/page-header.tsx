import { cn } from "@/lib/cn";

// The page frame. Until now every screen decided its own title size, padding and
// container width inside a client component, which is why no two agreed.
//
// `className` exists so callers can pass the same centring container they give their
// `PageBody` (e.g. "mx-auto max-w-3xl"). The width is deliberately duplicated on both
// components today; package 6C should collapse PageHeader and PageBody into a single
// frame component that owns the width once.
//
// `w-full` is load-bearing: these are flex items in a column, so the horizontal
// axis is the cross axis, and `mx-auto` there cancels `align-self: stretch`. Without
// an explicit width the element shrinks to its content, so a text-only header and a
// table-filled body centre at different widths and their left edges disagree.
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full flex items-start justify-between gap-4 px-4 pt-4 md:px-6 md:pt-6", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-sm text-ink-muted">{description}</p>}
      </div>
      {/* No `flex-none` here (there used to be one): `flex-none` sets
          flex-shrink:0, and a flex item with shrink disabled is sized to its
          own max-content width regardless of how little room the header
          actually has -- which also means `flex-wrap` right next to it can
          never fire, because wrapping only kicks in once a flex-wrap
          container is laid out narrower than its unwrapped content, and a
          shrink:0 item is never laid out narrower than that. Measured on the
          Files header (a long "Upload to" workspace name at 320px): with
          `flex-none` still present, the caller's own flex-wrap fix (see
          files-manager.tsx) had no effect and the header still overflowed;
          dropping it let the actions wrap and closed the overflow to 0.
          Default flex-shrink (1) with the default auto min-width only
          engages when space is actually short, so this is a no-op for every
          other PageHeader caller that already fits. */}
      {actions && <div data-testid="page-actions" className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  );
}

// `pb-10` rather than a symmetric padding: this is the scroller, and a table or a
// long form that ends flush against the bottom edge reads as cut off — there is no
// way to tell "this is the end" from "there is more below". The extra space at the
// end of the scroll is the signal.
export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("w-full min-h-0 flex-1 overflow-y-auto p-4 pb-10 md:p-6 md:pb-12", className)}>{children}</div>;
}
