import { Activity } from "lucide-react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import type { UsageRow } from "@/lib/analytics/usage";

// Serves both the by-user and by-workspace breakdowns; deliberately ignorant of
// which. The SQL already sorted `rows` (heaviest first, ties by label) — this
// component renders them in the order given and must not re-sort.
export function UsageTable({ rows, emptyMessage }: { rows: UsageRow[]; emptyMessage: string }) {
  if (rows.length === 0) return <EmptyState icon={Activity} title={emptyMessage} />;
  return (
    <Table>
      <THead>
        <TR>
          <TH>Label</TH>
          <TH numeric>Prompt</TH>
          <TH numeric>Completion</TH>
          <TH numeric>Total</TH>
          <TH numeric>Answers</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r, i) => (
          <TR key={r.id ?? `unassigned-${i}`}>
            <TD className="truncate">{r.label}</TD>
            <TD numeric>{r.promptTokens.toLocaleString("en-US")}</TD>
            <TD numeric>{r.completionTokens.toLocaleString("en-US")}</TD>
            <TD numeric>{r.totalTokens.toLocaleString("en-US")}</TD>
            <TD numeric>{r.answers.toLocaleString("en-US")}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
