import { describe, it, expect, vi } from "vitest";
import { listFiles, extOf } from "./service";
import { documents } from "@/lib/db/schema";

describe("extOf", () => {
  it("returns the lowercased extension without a dot", () => {
    expect(extOf("Report.PDF")).toBe("pdf");
    expect(extOf("photo.jpeg")).toBe("jpeg");
    expect(extOf("noext")).toBe("");
    expect(extOf("trailing.")).toBe("");
  });
});

describe("listFiles", () => {
  it("merges documents + images into FileRows, newest first, caption null for docs", async () => {
    const db = {
      select: () => ({
        from: (table: unknown) =>
          table === documents
            ? Promise.resolve([{ id: "d1", filename: "a.PDF", status: "ready", error: null, createdAt: new Date("2026-01-02") }])
            : Promise.resolve([{ id: "i1", filename: "b.png", status: "processing", error: null, caption: "a cat", createdAt: new Date("2026-01-01") }]),
      }),
    };
    const workspacesForFilesFn = vi.fn(async () => ({ documents: new Map(), images: new Map() }));
    const rows = await listFiles(db as never, { workspacesForFilesFn: workspacesForFilesFn as never });
    expect(rows.map((r) => r.kind)).toEqual(["document", "image"]); // d1 (Jan 2) before i1 (Jan 1)
    expect(rows[0]).toMatchObject({ id: "d1", kind: "document", ext: "pdf", caption: null, status: "ready" });
    expect(rows[1]).toMatchObject({ id: "i1", kind: "image", ext: "png", caption: "a cat", status: "processing" });
    expect(rows[0].workspaces).toEqual([]);
    expect(rows[1].workspaces).toEqual([]);
  });

  it("attaches each file's workspaces, defaulting to [] when unassigned", async () => {
    let call = 0;
    const database = {
      select: () => ({
        from: async () => {
          call += 1;
          return call === 1
            ? [{ id: "d1", filename: "a.md", status: "ready", error: null, createdAt: new Date(0) }]
            : [{ id: "i1", filename: "b.png", status: "ready", error: null, caption: "c", createdAt: new Date(0) }];
        },
      }),
    } as never;
    const workspacesForFilesFn = vi.fn(async () => ({
      documents: new Map([["d1", [{ id: "w1", name: "General", isDefault: true }]]]),
      images: new Map(), // i1 has no membership
    }));

    const rows = await listFiles(database, { workspacesForFilesFn: workspacesForFilesFn as never });

    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.d1.workspaces).toEqual([{ id: "w1", name: "General", isDefault: true }]);
    expect(byId.i1.workspaces).toEqual([]);
    expect(workspacesForFilesFn).toHaveBeenCalledWith(["d1"], ["i1"], database);
  });
});
