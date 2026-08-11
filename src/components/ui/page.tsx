import { cn } from "@/lib/cn";

// The page frame. It owns the title block, the scrolling body, and -- the point of
// this component existing -- the page width, declared once.
//
// Until 0.6.5 this was two components, PageHeader and PageBody, and every screen
// passed the same width class to both: two to four times per screen, since each
// settings form repeated it across its load-error, loading and content branches.
// page-header.tsx asked for this collapse from the day it was written. The
// duplication never drifted within a screen, but it did drift BETWEEN them --
// /account ended up the only uncentred screen in the application.
//
// WIDTHS is a closed set on purpose. A free-form className is what allowed that
// drift; choosing among three named options makes a fourth width a deliberate edit
// here rather than an unnoticed string at one call site.
//
// The `w-full` in the base class lists is why the map carries no `w-full` of its
// own: the old `wide` call sites passed `mx-auto w-full max-w-6xl`, whose `w-full`
// was already redundant.
const WIDTHS = {
  narrow: "max-w-xl",
  form: "mx-auto max-w-2xl",
  wide: "mx-auto max-w-6xl",
} as const;

export type PageWidth = keyof typeof WIDTHS;

export function Page({
  width,
  title,
  description,
  actions,
  contentClassName,
  children,
}: {
  width: PageWidth;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Content spacing for the body (e.g. "space-y-4"). Width does NOT go here -- that
   *  is what `width` is for, and mixing the two is the duplication this replaced. */
  contentClassName?: string;
  children: React.ReactNode;
}) {
  const frame = WIDTHS[width];
  return (
    // A Fragment, never a wrapper element. Callers render this inside a
    // `flex min-h-0 flex-1 flex-col` column, and the body's `flex-1 min-h-0`
    // produces a scroller only as a DIRECT flex child of that column. Wrapping
    // these two in a div breaks scrolling on every screen, and jsdom has no
    // layout, so no test could catch it -- page.test.tsx asserts the structure
    // instead.
    <>
      {/* `w-full` is load-bearing: these are flex items in a column, so the
          horizontal axis is the cross axis, and `mx-auto` there cancels
          align-self: stretch. Without an explicit width the element shrinks to its
          content, so a text-only header and a table-filled body centre at
          different widths and their left edges disagree. */}
      <div
        data-testid="page-header"
        className={cn("w-full flex items-start justify-between gap-4 px-4 pt-4 md:px-6 md:pt-6", frame)}
      >
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-1 max-w-prose text-sm text-ink-muted">{description}</p>}
        </div>
        {/* No `flex-none` here (there used to be one): `flex-none` sets
            flex-shrink:0, and a flex item with shrink disabled is sized to its own
            max-content width regardless of how little room the header actually has
            -- which also means `flex-wrap` right next to it can never fire, because
            wrapping only kicks in once a flex-wrap container is laid out narrower
            than its unwrapped content, and a shrink:0 item is never laid out
            narrower than that. Measured on the Files header (a long "Upload to"
            workspace name at 320px): with `flex-none` still present, the caller's
            own flex-wrap fix (see files-manager.tsx) had no effect and the header
            still overflowed; dropping it let the actions wrap and closed the
            overflow to 0. Default flex-shrink (1) with the default auto min-width
            only engages when space is actually short, so this is a no-op for every
            screen that already fits. */}
        {actions && (
          <div data-testid="page-actions" className="flex flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        )}
      </div>
      {/* `pb-10` rather than a symmetric padding: this is the scroller, and a table
          or a long form that ends flush against the bottom edge reads as cut off --
          there is no way to tell "this is the end" from "there is more below". The
          extra space at the end of the scroll is the signal. */}
      <div
        data-testid="page-body"
        className={cn(
          "w-full min-h-0 flex-1 overflow-y-auto p-4 pb-10 md:p-6 md:pb-12",
          frame,
          contentClassName,
        )}
      >
        {children}
      </div>
    </>
  );
}
