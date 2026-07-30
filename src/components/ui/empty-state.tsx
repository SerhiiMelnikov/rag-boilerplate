// An empty screen is an invitation to act, so the action is part of the component
// rather than something each caller remembers to add.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {Icon && <Icon className="h-7 w-7 text-ink-subtle" />}
      <p className="text-lg font-semibold text-ink">{title}</p>
      {description && <p className="max-w-prose text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
