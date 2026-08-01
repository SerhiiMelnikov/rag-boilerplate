import { cn } from "@/lib/cn";

// The frame all five auth screens share. Before this each of them centred its own
// max-w-sm form with its own top margin, which is why the login and reset screens
// sat at different heights.
export function AuthCard({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className={cn("w-full max-w-[326px] rounded-lg border border-border bg-surface p-6 shadow-raise", className)}>
        <div className="mb-4 flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-6 w-6 items-center justify-center rounded-sm bg-accent text-xs font-bold text-accent-ink"
          >
            R
          </span>
          <span className="text-md font-semibold text-ink">RAG Chat</span>
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-xs text-ink-muted">{description}</p>}
        <div className="mt-4 flex flex-col gap-3">{children}</div>
        {footer && <div className="mt-4 text-center text-xs text-ink-muted">{footer}</div>}
      </div>
    </div>
  );
}
