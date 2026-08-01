import { cn } from "@/lib/cn";

// Ticks stop being countable long before the sources do; past this the consumer's
// text label ("12 sources") carries the number.
const MAX_TICKS = 4;

// The signature of the design: an answer is never freestanding, it stands on the
// documents it cited. A dashed, tickless rule is the one case that matters most —
// the model answered from its own knowledge, not from the corpus.
//
// Decorative by construction: aria-hidden, because the count is conveyed as text
// beside it. A consumer that renders this rule *instead of* the count is a defect.
export function Gutter({
  sources,
  size = "md",
  className,
}: {
  sources: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const grounded = sources > 0;
  const ticks = Math.min(Math.max(sources, 0), MAX_TICKS);

  return (
    <span
      aria-hidden="true"
      data-grounded={grounded}
      className={cn(
        "relative inline-block w-[3px] flex-none self-stretch rounded-sm",
        size === "sm" ? "min-h-5" : "min-h-6",
        grounded ? "bg-accent-soft" : "border-l-[3px] border-dashed border-border-strong",
        className,
      )}
    >
      {Array.from({ length: ticks }, (_, index) => (
        <span
          key={index}
          data-tick
          // Proportional, not fixed pixels: tick i of n sits at (i+1)/(n+1) of
          // whatever height the rule stretches to, so four ticks always fit —
          // in a `size="sm"` table row exactly as much as a taller one — instead
          // of spilling past a rule whose height `size` never actually set.
          style={{ top: `${((index + 1) * 100) / (ticks + 1)}%` }}
          className="absolute -left-px h-[5px] w-[5px] -translate-y-1/2 rounded-full bg-accent"
        />
      ))}
    </span>
  );
}
