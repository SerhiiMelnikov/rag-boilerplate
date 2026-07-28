import type { UsageRow } from "@/lib/analytics/usage";

// Serves both the by-user and by-workspace breakdowns; deliberately ignorant of
// which. The SQL already sorted `rows` (heaviest first, ties by label) — this
// component renders them in the order given and must not re-sort.
export function UsageTable({ rows, emptyMessage }: { rows: UsageRow[]; emptyMessage: string }) {
  if (rows.length === 0) return <p className="text-sm text-zinc-500">{emptyMessage}</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-zinc-500">
        <tr>
          <th className="py-1">Label</th>
          <th className="text-right">Prompt</th>
          <th className="text-right">Completion</th>
          <th className="text-right">Total</th>
          <th className="text-right">Answers</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id ?? `unassigned-${i}`} className="border-t border-zinc-200 dark:border-zinc-800">
            <td className="truncate py-1">{r.label}</td>
            <td className="text-right">{r.promptTokens.toLocaleString("en-US")}</td>
            <td className="text-right">{r.completionTokens.toLocaleString("en-US")}</td>
            <td className="text-right">{r.totalTokens.toLocaleString("en-US")}</td>
            <td className="text-right">{r.answers.toLocaleString("en-US")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
