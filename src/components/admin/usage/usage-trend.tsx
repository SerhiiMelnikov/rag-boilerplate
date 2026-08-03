import { TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { USAGE_WINDOW_DAYS, type UsageTrendPoint } from "@/lib/analytics/usage";

// Daily tokens as plain CSS bars (no charting dependency, matching TrendBars).
// Bar width is each day's share of the busiest day in the set; guarded so an
// all-zero set renders zero-width bars instead of dividing by zero into NaN%.
export function UsageTrend({ points }: { points: UsageTrendPoint[] }) {
  if (points.length === 0) {
    return <EmptyState icon={TrendingUp} title={`No recorded usage in the last ${USAGE_WINDOW_DAYS} days.`} />;
  }
  const max = Math.max(...points.map((p) => p.totalTokens));
  return (
    <ul className="space-y-1">
      {points.map((p) => {
        const pct = max === 0 ? 0 : Math.round((p.totalTokens / max) * 100);
        return (
          <li key={p.day} className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 text-ink-muted">{p.day}</span>
            <div className="h-3 flex-1 rounded bg-accent-soft">
              <div className="h-3 rounded bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-20 shrink-0 text-right font-mono tabular-nums text-ink-muted">{p.totalTokens.toLocaleString("en-US")}</span>
          </li>
        );
      })}
    </ul>
  );
}
