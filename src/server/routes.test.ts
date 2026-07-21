import { describe, it, expect, vi } from "vitest";
import { createServer } from "./routes";
import { buildOpenApiDocument } from "@/lib/openapi/document";

// Only GET /api/health's default wiring (no injectable deps at the route level)
// touches the database directly, via db.execute("select 1"). Stub it here so the
// health route test exercises real routing without a live postgres connection —
// every other route under test here is either a public, pre-DB validation path
// (POST /api/auth/login) or short-circuited by the 401 middleware/guard before
// any handler ever reaches the database.
vi.mock("@/lib/db/client", () => ({ db: { execute: vi.fn(async () => undefined) } }));

describe("createServer", () => {
  it("GET /api/health returns 200", async () => {
    const app = createServer();
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("guards a protected route with 401 when unauthenticated (middleware, no DB hit)", async () => {
    const app = createServer();
    const res = await app.request("/api/conversations");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("also guards /api/admin/* and /api/chat/* prefixes", async () => {
    const app = createServer();
    expect((await app.request("/api/admin/users")).status).toBe(401);
    expect((await app.request("/api/chat", { method: "POST", body: "{}" })).status).toBe(401);
  });

  it("GET /api/openapi.json serves the generated OpenAPI document", async () => {
    const app = createServer();
    const res = await app.request("/api/openapi.json");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe("3.0.3");
    expect(Object.keys(body.paths).length).toBeGreaterThan(0);
  });

  it("mounts the Scalar API reference at /docs", async () => {
    const app = createServer();
    const res = await app.request("/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("reaches a public, non-DB handler directly (no session required)", async () => {
    // POST /api/auth/login is public (it is what MINTS a session); the handler
    // validates the body before ever touching the database, so this exercises
    // real handler logic (not just routing) without a DB dependency.
    const app = createServer();
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "email and password are required" });
  });

  it("wires every documented endpoint (minus the Auth.js catch-all) plus POST /api/auth/login", () => {
    // Anti-drift guard for the route table itself: every (method, path) the OpenAPI
    // document lists must have a matching Hono route, except the Auth.js [...nextauth]
    // catch-all (there is no Auth.js mount in this api-only build — POST /api/auth/login
    // replaces it), and vice versa (no undocumented extra API route besides /docs, which
    // is a UI page, not part of the documented API surface).
    const app = createServer();
    const doc = buildOpenApiDocument();

    const docRoutes = new Set<string>();
    for (const [path, item] of Object.entries(doc.paths ?? {})) {
      if (path === "/api/auth/{nextauth}") continue;
      for (const method of ["get", "post", "put", "patch", "delete"] as const) {
        if ((item as Record<string, unknown>)[method]) docRoutes.add(`${method.toUpperCase()} ${path}`);
      }
    }
    docRoutes.add("POST /api/auth/login");

    const normalize = (p: string) => p.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
    const wired = new Set(
      app.routes
        .filter((r) => r.method !== "ALL" && r.path !== "/docs")
        .map((r) => `${r.method} ${normalize(r.path)}`),
    );

    expect(wired).toEqual(docRoutes);
  });
});
