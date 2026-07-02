import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getFeedbackSummary,
  getRecentNegative,
  getDocumentQuality,
  getSatisfactionTrend,
} from "@/lib/analytics/feedback";
import { StatTiles } from "@/components/admin/analytics/stat-tiles";
import { NegativeList } from "@/components/admin/analytics/negative-list";
import { DocumentQualityTable } from "@/components/admin/analytics/document-quality-table";
import { TrendBars } from "@/components/admin/analytics/trend-bars";

export default async function AnalyticsPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");
  const [summary, negatives, docs, trend] = await Promise.all([
    getFeedbackSummary(),
    getRecentNegative(20),
    getDocumentQuality(),
    getSatisfactionTrend(),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4">
      <h1 className="text-lg font-semibold">Answer feedback</h1>
      <section>
        <StatTiles summary={summary} />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Satisfaction (last 30 days)</h2>
        <TrendBars points={trend} />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Recent 👎 answers</h2>
        <NegativeList items={negatives} />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Document quality</h2>
        <DocumentQualityTable rows={docs} />
      </section>
    </div>
  );
}
