import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export interface HealthDeps {
  pingDb?: () => Promise<void>;
}

// Liveness/readiness probe for the container HEALTHCHECK (see Dockerfile).
//
// Public by design: a healthcheck carries no session. That is why the failure body
// is a fixed string — a postgres-js connection error embeds the connection string
// (password and all), and this endpoint is reachable by anyone who can reach the
// app.
export async function healthCheck(deps: HealthDeps = {}): Promise<Response> {
  const pingDb = deps.pingDb ?? (async () => { await db.execute(sql`select 1`); });
  try {
    await pingDb();
    return Response.json({ status: "ok" }, { status: 200 });
  } catch (err) {
    // Log the real cause server-side; return nothing useful to the caller.
    console.error("health: database unreachable", err);
    return Response.json({ status: "error" }, { status: 503 });
  }
}
