import type { DocumentQuality } from "@/lib/analytics/feedback";

// Documents ranked by how often they feed downvoted answers.
export function DocumentQualityTable({ rows }: { rows: DocumentQuality[] }) {
  if (rows.length === 0) return <p className="text-sm text-zinc-500">No document feedback yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-zinc-500">
        <tr>
          <th className="py-1">Document</th>
          <th>Uses</th>
          <th>👍</th>
          <th>👎</th>
          <th>Satisfaction</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.documentId} className="border-t border-zinc-200 dark:border-zinc-800">
            <td className="truncate py-1">{r.filename || r.documentId}</td>
            <td>{r.appearances}</td>
            <td>{r.up}</td>
            <td>{r.down}</td>
            <td>{r.up + r.down === 0 ? "—" : `${Math.round(r.satisfaction * 100)}%`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
