import { cn } from "@/lib/cn";

// A bordered surface. No shadow: `shadow-raise` is reserved for the auth card and
// the rail's active pill, and `shadow-pop` for things that actually float.
export function Card({
  title,
  description,
  actions,
  className,
  children,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface p-4", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-md font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
