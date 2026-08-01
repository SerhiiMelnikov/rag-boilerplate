import { cn } from "@/lib/cn";

// Every table owns its own scroll container. Several admin tables are wider than a
// phone, and a page that scrolls sideways as a whole is unusable — the negative
// margins let the scroll area bleed to the screen edge inside a padded page.
export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <table className={cn("w-full border-collapse text-sm", className)}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-surface-2">{children}</thead>;
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({ className, children }: { className?: string; children: React.ReactNode }) {
  return <tr className={cn("border-b border-border last:border-b-0", className)}>{children}</tr>;
}

export function TH({
  numeric = false,
  className,
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      {...props}
      className={cn(
        "border-b border-border px-3 py-2 text-left text-2xs font-semibold uppercase text-ink-subtle",
        numeric && "text-right",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TD({
  numeric = false,
  className,
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      {...props}
      className={cn(
        // 52px rows on touch, 40px once there is a pointer: text-sm is 13px on a
        // 19px line, so 16px of padding either side plus the 1px border makes 52,
        // and 10px makes 40.
        "px-3 py-4 text-ink md:py-2.5",
        numeric && "text-right font-mono tabular-nums",
        className,
      )}
    >
      {children}
    </td>
  );
}
