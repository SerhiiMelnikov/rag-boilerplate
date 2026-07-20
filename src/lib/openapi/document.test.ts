import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildOpenApiDocument } from "./document";

// Walk src/app/api for route.ts files, derive the URL path + exported HTTP methods.
function collectRoutes(dir: string, base = ""): Array<{ path: string; method: string }> {
  const out: Array<{ path: string; method: string }> = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // [id] -> {id}, [kind] -> {kind}, [...nextauth] -> {nextauth}
      const seg = entry.replace(/^\[\.\.\.(.+)\]$/, "{$1}").replace(/^\[(.+)\]$/, "{$1}");
      out.push(...collectRoutes(full, `${base}/${seg}`));
    } else if (entry === "route.ts") {
      const src = readFileSync(full, "utf8");
      for (const m of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
        // NOTE: this only matches `export function METHOD` / `export async function METHOD`.
        // src/app/api/auth/[...nextauth]/route.ts instead uses `export const { GET, POST } =
        // handlers` (destructured from next-auth) and legitimately does not match this regex.
        // That's acceptable here: nextauth's GET/POST are already documented (Task 2), and the
        // enumeration's job is only to catch a normal `export function METHOD` route that
        // someone forgot to document — not to force-parse every export style.
        if (new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(src)) {
          out.push({ path: `/api${base}`, method: m.toLowerCase() });
        }
      }
    }
  }
  return out;
}

describe("buildOpenApiDocument", () => {
  const doc = buildOpenApiDocument();
  it("is a valid OpenAPI 3.0 document shell", () => {
    expect(doc.openapi).toBe("3.0.3");
    expect(doc.info.title).toBeTruthy();
    expect(doc.info.version).toBe("0.5.1");
  });
  it("declares the sessionCookie security scheme", () => {
    expect(doc.components?.securitySchemes?.sessionCookie).toMatchObject({ type: "apiKey", in: "cookie" });
  });
  it("registers the core component schemas", () => {
    for (const name of ["ErrorResponse", "SourceRef", "ImageResult", "Conversation", "Message", "Workspace"]) {
      expect(doc.components?.schemas?.[name]).toBeTruthy();
    }
  });
  it("documents core client endpoints", () => {
    expect(doc.paths?.["/api/health"]?.get).toBeTruthy();
    expect(doc.paths?.["/api/conversations"]?.get?.security).toEqual([{ sessionCookie: [] }]);
    expect(doc.paths?.["/api/chat"]?.post).toBeTruthy();
    expect(doc.paths?.["/api/register"]?.post).toBeTruthy(); // public: no security
    expect(doc.paths?.["/api/register"]?.post?.security).toBeUndefined();
  });
  it("documents admin endpoints as guarded, with a 403 response", () => {
    const usersGet = doc.paths?.["/api/admin/users"]?.get;
    expect(usersGet?.security).toEqual([{ sessionCookie: [] }]);
    expect(usersGet?.responses?.[403]).toBeTruthy();
  });
  it("documents the evaluation endpoints as guarded, with 401 + 403 responses", () => {
    for (const [path, method] of [
      ["/api/admin/evaluation/questions", "get"],
      ["/api/admin/evaluation/questions", "post"],
      ["/api/admin/evaluation/questions/{id}", "patch"],
      ["/api/admin/evaluation/questions/{id}", "delete"],
      ["/api/admin/evaluation/runs", "get"],
      ["/api/admin/evaluation/runs", "post"],
      ["/api/admin/evaluation/runs/{id}", "get"],
    ] as const) {
      const item = doc.paths?.[path] as Record<string, { security?: unknown; responses?: Record<string, unknown> }> | undefined;
      const op = item?.[method];
      expect(op, `${method.toUpperCase()} ${path}`).toBeTruthy();
      expect(op?.security).toEqual([{ sessionCookie: [] }]);
      expect(op?.responses?.[401]).toBeTruthy();
      expect(op?.responses?.[403]).toBeTruthy();
    }
  });

  it("documents every API route (anti-drift)", () => {
    const routes = collectRoutes(join(process.cwd(), "src/app/api"));
    const missing = routes.filter((r) => {
      const item = doc.paths?.[r.path] as Record<string, unknown> | undefined;
      return !item || !item[r.method];
    });
    expect(missing).toEqual([]);
  });

  it("every operation carrying `security` also declares a 401 response", () => {
    const offenders: string[] = [];
    for (const [path, item] of Object.entries(doc.paths ?? {})) {
      for (const [method, op] of Object.entries(item as Record<string, unknown>)) {
        if (!op || typeof op !== "object") continue;
        const operation = op as { security?: unknown; responses?: Record<string, unknown> };
        if (operation.security && !operation.responses?.[401]) {
          offenders.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("documents at least 27 (path, method) operations", () => {
    let count = 0;
    for (const item of Object.values(doc.paths ?? {})) {
      for (const method of Object.keys(item as Record<string, unknown>)) {
        if (["get", "post", "put", "patch", "delete"].includes(method)) count++;
      }
    }
    expect(count).toBeGreaterThanOrEqual(27);
  });
});
