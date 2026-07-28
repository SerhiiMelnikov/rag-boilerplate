import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { getUsageSummary, getUsageByUser, getUsageByWorkspace, getUsageTrend } from "@/lib/analytics/usage";

export interface UsageDeps {
  getAdmin?: typeof requireAdmin;
  summaryFn?: typeof getUsageSummary;
  byUserFn?: typeof getUsageByUser;
  byWorkspaceFn?: typeof getUsageByWorkspace;
  trendFn?: typeof getUsageTrend;
}

// All four aggregates in one payload: the dashboard renders them together, and a
// single documented endpoint is a smaller surface to keep honest than four.
export async function getUsageResponse(request: Request, deps: UsageDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const summaryFn = deps.summaryFn ?? getUsageSummary;
  const byUserFn = deps.byUserFn ?? getUsageByUser;
  const byWorkspaceFn = deps.byWorkspaceFn ?? getUsageByWorkspace;
  const trendFn = deps.trendFn ?? getUsageTrend;
  try {
    await getAdmin(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const [summary, byUser, byWorkspace, trend] = await Promise.all([
    summaryFn(), byUserFn(), byWorkspaceFn(), trendFn(),
  ]);
  return Response.json({ summary, byUser, byWorkspace, trend });
}
