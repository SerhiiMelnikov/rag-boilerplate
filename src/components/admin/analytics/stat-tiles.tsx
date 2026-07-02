import type { FeedbackSummary } from "@/lib/analytics/feedback";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
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
