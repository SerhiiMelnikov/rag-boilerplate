import { registry } from "../registry";
import { z } from "../zod";
import { ErrorResponse } from "../schemas";

// Mirrors UsageSummary (src/lib/analytics/usage.ts).
const UsageSummary = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  answers: z.number(),
});

// Mirrors UsageRow (src/lib/analytics/usage.ts). `id` is null for the
// "Unassigned" workspace bucket in the byWorkspace breakdown.
const UsageRow = z.object({
  id: z.string().nullable(),
  label: z.string(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  answers: z.number(),
});

// Mirrors UsageTrendPoint (src/lib/analytics/usage.ts).
const UsageTrendPoint = z.object({
  day: z.string(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
});

// GET /api/admin/usage (src/app/api/admin/usage/route.ts -> handler.ts: getUsageResponse) —
// all four aggregates from src/lib/analytics/usage.ts in one payload, over the shared
// USAGE_WINDOW_DAYS window.
registry.registerPath({
  method: "get",
  path: "/api/admin/usage",
  tags: ["Admin: Usage"],
  summary: "Token usage aggregations for the admin dashboard",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Usage summary, per-user and per-workspace breakdowns, and the daily trend",
      content: {
        "application/json": {
          schema: z.object({
            summary: UsageSummary,
            byUser: z.array(UsageRow),
            byWorkspace: z.array(UsageRow),
            trend: z.array(UsageTrendPoint),
          }),
        },
      },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
  },
});
