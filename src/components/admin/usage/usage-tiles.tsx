import type { UsageSummary } from "@/lib/analytics/usage";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

// Window totals. Large token counts are locale-formatted so a seven-digit
// number reads as 1,234,567 rather than being misread by an order of magnitude.
export function UsageTiles({ summary }: { summary: UsageSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="Prompt" value={summary.promptTokens.toLocaleString("en-US")} />
      <Tile label="Completion" value={summary.completionTokens.toLocaleString("en-US")} />
      <Tile label="Total" value={summary.totalTokens.toLocaleString("en-US")} />
      <Tile label="Answers" value={summary.answers.toLocaleString("en-US")} />
    </div>
  );
}
