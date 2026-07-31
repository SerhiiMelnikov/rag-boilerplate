import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { NAV, activeGroup, visibleGroups } from "@/components/shell/nav-config";

const APP_GROUP_DIR = fileURLToPath(new URL("../../app/(app)", import.meta.url));

// Walk (app)/ and turn every page.tsx into the route it serves:
// admin/files/page.tsx -> /admin/files, page.tsx -> /
function routesUnder(dir: string, prefix = ""): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // Route groups like (app) are not path segments.
      const segment = entry.name.startsWith("(") ? prefix : `${prefix}/${entry.name}`;
      routes.push(...routesUnder(join(dir, entry.name), segment));
    } else if (entry.name === "page.tsx") {
      routes.push(prefix === "" ? "/" : prefix);
    }
  }
  return routes;
}

const routes = routesUnder(APP_GROUP_DIR);
const navHrefs = new Set(NAV.flatMap((g) => [g.href, ...g.items.map((i) => i.href)]));

describe("navigation reachability", () => {
  it("finds the app's routes at all (guards against a broken walk silently passing)", () => {
    expect(routes).toContain("/");
    expect(routes.length).toBeGreaterThanOrEqual(8);
  });

  it("points every nav entry at a route that exists", () => {
    for (const href of navHrefs) {
      expect(routes, `NAV points at ${href}, which has no page.tsx`).toContain(href);
    }
  });

  // The guard whose absence let eight admin pages hide inside a profile dropdown.
  it("reaches every admin route from the nav", () => {
    for (const route of routes.filter((r) => r.startsWith("/admin"))) {
      expect(navHrefs, `${route} exists but nothing in NAV links to it`).toContain(route);
    }
  });
});

describe("visibleGroups", () => {
  it("shows a plain user only chat and account", () => {
    expect(visibleGroups("user", false).map((g) => g.id)).toEqual(["chat", "account"]);
  });

  it("shows an admin everything except people", () => {
    const ids = visibleGroups("admin", false).map((g) => g.id);
    expect(ids).toEqual(["chat", "knowledge", "insights", "settings", "account"]);
    expect(ids).not.toContain("people");
  });

  it("shows a super-admin people as well", () => {
    expect(visibleGroups("admin", true).map((g) => g.id)).toContain("people");
  });
});

describe("activeGroup", () => {
  it.each([
    ["/", "chat"],
    ["/admin/files", "knowledge"],
    ["/admin/workspaces", "knowledge"],
    ["/admin/analytics", "insights"],
    ["/admin/usage", "insights"],
    ["/admin/evaluation", "insights"],
    ["/admin/settings", "settings"],
    // The reason resolution is longest-match: /admin/keys is a Settings sub-item,
    // and a naive prefix scan would leave the rail highlighting nothing.
    ["/admin/keys", "settings"],
    ["/admin/users", "people"],
    ["/account", "account"],
  ])("resolves %s to %s", (pathname, expected) => {
    expect(activeGroup(pathname)?.id).toBe(expected);
  });

  it("does not let the chat's / match every other route", () => {
    expect(activeGroup("/admin/files")?.id).not.toBe("chat");
  });

  it("returns undefined for a route outside the shell", () => {
    expect(activeGroup("/login")).toBeUndefined();
  });
});
