import { TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { TrendPoint } from "@/lib/analytics/feedback";

// Daily satisfaction as plain CSS bars (no charting dependency).
export function TrendBars({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) {
    return <EmptyState icon={TrendingUp} title="No rated answers in the last 30 days." />;
  }
  return (
    <ul className="space-y-1">
      {points.map((p) => (
        <li key={p.day} className="flex items-center gap-2 text-xs">
          <span className="w-20 shrink-0 text-ink-muted">{p.day}</span>
          <div className="h-3 flex-1 rounded bg-accent-soft">
            <div className="h-3 rounded bg-accent" style={{ width: `${Math.round(p.satisfaction * 100)}%` }} />
          </div>
          <span className="w-16 shrink-0 font-mono tabular-nums text-ink-muted">{p.up}👍 {p.down}👎</span>
        </li>
      ))}
    </ul>
  );
}
