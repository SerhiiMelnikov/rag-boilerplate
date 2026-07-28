import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUsageSummary, getUsageByUser, getUsageByWorkspace, getUsageTrend, USAGE_WINDOW_DAYS } from "@/lib/analytics/usage";
import { UsageTiles } from "@/components/admin/usage/usage-tiles";
import { UsageTable } from "@/components/admin/usage/usage-table";
import { UsageTrend } from "@/components/admin/usage/usage-trend";

export default async function UsagePage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");
  const [summary, byUser, byWorkspace, trend] = await Promise.all([
    getUsageSummary(), getUsageByUser(), getUsageByWorkspace(), getUsageTrend(),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4">
      <h1 className="text-lg font-semibold">Token usage</h1>
      <p className="text-sm text-zinc-500">
        Model tokens recorded on answers over the last {USAGE_WINDOW_DAYS} days. Answers that make no model call
        (image results) record no tokens and are not counted.
      </p>
      <section><UsageTiles summary={summary} /></section>
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Daily tokens</h2>
        <UsageTrend points={trend} />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-medium">By user</h2>
        <UsageTable rows={byUser} emptyMessage="No recorded usage in this period." />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-medium">By workspace</h2>
        <UsageTable rows={byWorkspace} emptyMessage="No recorded usage in this period." />
      </section>
    </div>
  );
}
