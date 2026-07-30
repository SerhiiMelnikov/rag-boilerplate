import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "danger";

const TONES: Record<Tone, string> = {
  info: "bg-surface-2 text-ink-muted border-border",
  success: "bg-success-soft text-success border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
};

// Replaces six hand-rolled notice blocks. The role follows the tone: only a
// failure earns the right to interrupt a screen reader mid-sentence.
export function Alert({
  tone = "info",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded border px-3 py-2 text-sm", TONES[tone], className)}
    >
      {children}
    </p>
  );
}
