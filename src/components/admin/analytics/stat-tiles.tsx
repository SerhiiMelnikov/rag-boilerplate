import type { FeedbackSummary } from "@/lib/analytics/feedback";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="font-mono text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-ink-muted">{label}</div>
    </div>
  );
}

// Overall feedback counts. Satisfaction shows a dash when nothing is rated yet.
export function StatTiles({ summary }: { summary: FeedbackSummary }) {
  const pct = summary.up + summary.down === 0 ? "—" : `${Math.round(summary.satisfaction * 100)}%`;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Tile label="Answers" value={String(summary.total)} />
      <Tile label="Rated" value={String(summary.rated)} />
      <Tile label="👍 Up" value={String(summary.up)} />
      <Tile label="👎 Down" value={String(summary.down)} />
      <Tile label="Unrated" value={String(summary.unrated)} />
      <Tile label="Satisfaction" value={pct} />
    </div>
  );
}
