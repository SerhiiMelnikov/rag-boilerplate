import { requirePageAdmin } from "../../guards";
import { getUsageSummary, getUsageByUser, getUsageByWorkspace, getUsageTrend, USAGE_WINDOW_DAYS } from "@/lib/analytics/usage";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { UsageTiles } from "@/components/admin/usage/usage-tiles";
import { UsageTable } from "@/components/admin/usage/usage-table";
import { UsageTrend } from "@/components/admin/usage/usage-trend";

export default async function UsagePage() {
  await requirePageAdmin();
  const [summary, byUser, byWorkspace, trend] = await Promise.all([
    getUsageSummary(), getUsageByUser(), getUsageByWorkspace(), getUsageTrend(),
  ]);
  return (
    <>
      <PageHeader
        className="mx-auto w-full max-w-6xl"
        title="Token usage"
        description="Prompt and completion tokens over the last 30 days. Tokens, not money — the model that produced them was never recorded."
      />
      <PageBody className="mx-auto w-full max-w-6xl space-y-8">
        {/* Kept verbatim from the pre-redesign page: it explains a real discrepancy
            (this answer count vs. the one on Analytics), which the one-line header
            description above doesn't cover. */}
        <p className="text-sm text-ink-muted">
          Model tokens recorded on answers over the last {USAGE_WINDOW_DAYS} days. Replies that never reach the
          model — image results, and the fallbacks for no retrieved context or a provider error — record no
          tokens and are not counted here, so this answer count is lower than the one on Analytics.
        </p>
        <UsageTiles summary={summary} />
        <Card title="Daily tokens">
          <UsageTrend points={trend} />
        </Card>
        <Card title="By user">
          <UsageTable rows={byUser} emptyMessage="No recorded usage in this period." />
        </Card>
        <Card title="By workspace">
          <UsageTable rows={byWorkspace} emptyMessage="No recorded usage in this period." />
        </Card>
      </PageBody>
    </>
  );
}
