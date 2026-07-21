import type { MiddlewareHandler } from "hono";
import { getSessionFromRequest } from "@/lib/auth/session";

// Coarse pre-filter for the standalone Hono server, equivalent to src/middleware.ts's
// NextAuth-backed matcher in the Next.js build: requires *a* session for the matched
// prefixes. Fine-grained role checks (admin/super-admin) still happen per-route via
// requireAdmin/requireSuperAdmin inside each handler — this only rejects anonymous
// callers before they reach a handler at all.
export const requireSession: MiddlewareHandler = async (c, next) => {
  if (!(await getSessionFromRequest(c.req.raw))) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
};
