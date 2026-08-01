import { cn } from "@/lib/cn";

// The page frame. Until now every screen decided its own title size, padding and
// container width inside a client component, which is why no two agreed.
//
// `className` exists so callers can pass the same centring container they give their
// `PageBody` (e.g. "mx-auto max-w-3xl"), otherwise the title sits flush left while the
// body content it describes is centred below it. The width is deliberately duplicated
// on both components today; package 6C should collapse PageHeader and PageBody into a
// single frame component that owns the width once.
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
    <div className={cn("flex items-start justify-between gap-4 px-4 pt-4 md:px-6 md:pt-6", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto p-4 md:p-6", className)}>{children}</div>;
}
