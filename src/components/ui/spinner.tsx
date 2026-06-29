import { Loader2 } from "lucide-react";

// Small spinning loader. `label` provides an accessible name for screen readers.
export function Spinner({ className = "h-4 w-4", label = "Loading" }: { className?: string; label?: string }) {
  return <Loader2 role="status" aria-label={label} className={`animate-spin ${className}`} />;
}
