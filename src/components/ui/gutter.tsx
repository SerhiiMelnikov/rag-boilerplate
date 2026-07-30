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
          style={{ top: `${4 + index * 12}px` }}
          className="absolute -left-px h-[5px] w-[5px] rounded-full bg-accent"
        />
      ))}
    </span>
  );
}
