import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-muted border-border",
  accent: "bg-accent-soft text-accent border-transparent",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
};

export function Badge({
  tone = "neutral",
  dashed = false,
  className,
  children,
}: {
  tone?: Tone;
  dashed?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs tracking-normal",
        TONES[tone],
        // The same visual language as Gutter's no-source state: dashed means "not
        // connected to the knowledge base".
        dashed && "border-dashed border-border-strong bg-transparent text-ink-subtle",
        className,
      )}
    >
      {children}
    </span>
  );
}
