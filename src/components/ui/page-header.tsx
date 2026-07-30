import { cn } from "@/lib/cn";

// The page frame. Until now every screen decided its own title size, padding and
// container width inside a client component, which is why no two agreed.
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 pt-4 md:px-6 md:pt-6">
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
