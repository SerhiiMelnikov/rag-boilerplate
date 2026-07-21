import { registry } from "../registry";
import { z } from "../zod";

// GET /api/health (src/app/api/health/handler.ts): pings the database and returns a
// fixed { status } body either way — never the raw connection error, which would leak
// the connection string (password included). Public: a healthcheck carries no session.
registry.registerPath({
  method: "get",
  path: "/api/health",
  tags: ["Health"],
  summary: "Liveness/readiness probe for the container healthcheck",
  responses: {
    200: {
      description: "The app and its database are reachable",
      content: { "application/json": { schema: z.object({ status: z.literal("ok") }) } },
    },
    503: {
      description: "The database is unreachable",
      content: { "application/json": { schema: z.object({ status: z.literal("error") }) } },
    },
  },
});
