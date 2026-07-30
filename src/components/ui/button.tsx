import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

// Focus is never removed, only replaced. Every interactive primitive spreads this
// exact string, so a keyboard user sees one affordance across the whole app and a
// test can assert its presence.
export const FOCUS_RING =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  secondary: "border border-border-strong bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink-muted hover:bg-surface-2 hover:text-ink",
  danger: "bg-danger text-danger-ink hover:bg-danger/90",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-xs",
  md: "h-[34px] gap-2 px-3 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      // A loading button that still fires submits the form twice.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded font-medium transition-colors duration-100",
        // Touch first: 44px until the viewport is big enough for the design's density.
        "min-h-11 md:min-h-0",
        SIZES[size],
        VARIANTS[variant],
        FOCUS_RING,
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {loading && <Spinner className="h-4 w-4" label="Working" />}
      {children}
    </button>
  );
}
