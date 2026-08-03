import { requirePageAdmin } from "../../guards";
import {
  getFeedbackSummary,
  getRecentNegative,
  getDocumentQuality,
  getSatisfactionTrend,
} from "@/lib/analytics/feedback";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatTiles } from "@/components/admin/analytics/stat-tiles";
import { NegativeList } from "@/components/admin/analytics/negative-list";
import { DocumentQualityTable } from "@/components/admin/analytics/document-quality-table";
import { TrendBars } from "@/components/admin/analytics/trend-bars";

export default async function AnalyticsPage() {
  await requirePageAdmin();
  const [summary, negatives, docs, trend] = await Promise.all([
    getFeedbackSummary(),
    getRecentNegative(20),
    getDocumentQuality(),
    getSatisfactionTrend(),
  ]);
  return (
    <>
      <PageHeader
        className="mx-auto w-full max-w-6xl"
        title="Answer feedback"
        description="What people thought of the answers, and which documents produced them."
      />
      <PageBody className="mx-auto w-full max-w-6xl space-y-8">
        <StatTiles summary={summary} />
        <Card title="Satisfaction (last 30 days)">
          <TrendBars points={trend} />
        </Card>
        <Card title="Recent 👎 answers">
          <NegativeList items={negatives} />
        </Card>
        <Card title="Document quality">
          <DocumentQualityTable rows={docs} />
        </Card>
      </PageBody>
    </>
  );
}
