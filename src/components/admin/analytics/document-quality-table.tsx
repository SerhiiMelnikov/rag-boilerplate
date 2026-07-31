import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import type { DocumentQuality } from "@/lib/analytics/feedback";

// Documents ranked by how often they feed downvoted answers.
export function DocumentQualityTable({ rows }: { rows: DocumentQuality[] }) {
  if (rows.length === 0) return <p className="text-sm text-ink-muted">No document feedback yet.</p>;
  return (
    <Table>
      <THead>
        <TR>
          <TH>Document</TH>
          <TH numeric>Uses</TH>
          <TH numeric>👍</TH>
          <TH numeric>👎</TH>
          <TH numeric>Satisfaction</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.documentId}>
            <TD className="truncate">{r.filename || r.documentId}</TD>
            <TD numeric>{r.appearances}</TD>
            <TD numeric>{r.up}</TD>
            <TD numeric>{r.down}</TD>
            <TD numeric>{r.up + r.down === 0 ? "—" : `${Math.round(r.satisfaction * 100)}%`}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
