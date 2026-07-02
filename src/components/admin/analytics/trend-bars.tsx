import type { TrendPoint } from "@/lib/analytics/feedback";

// Daily satisfaction as plain CSS bars (no charting dependency).
export function TrendBars({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) return <p className="text-sm text-zinc-500">No rated answers in the last 30 days.</p>;
  return (
    <ul className="space-y-1">
      {points.map((p) => (
        <li key={p.day} className="flex items-center gap-2 text-xs">
          <span className="w-20 shrink-0 text-zinc-500">{p.day}</span>
          <div className="h-3 flex-1 rounded bg-zinc-100 dark:bg-zinc-800">
            <div className="h-3 rounded bg-emerald-500" style={{ width: `${Math.round(p.satisfaction * 100)}%` }} />
          </div>
          <span className="w-16 shrink-0 text-zinc-500">{p.up}👍 {p.down}👎</span>
        </li>
      ))}
    </ul>
  );
}
