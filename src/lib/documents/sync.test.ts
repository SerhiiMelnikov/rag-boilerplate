import { describe, it, expect, vi } from "vitest";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import { planSync, applySync } from "./sync";

const settings = {} as unknown as RuntimeSettings;

function scanned(files: Array<{ path: string; hash: string }>) {
  return async () => ({ files: files.map((f) => ({ ...f, baseDir: "/d", root: "/d" })), errors: [] });
}

describe("planSync", () => {
  it("classifies add / update / delete against existing directory docs", async () => {
    const plan = await planSync({
      getSettings: async () => ({ ...settings, documentsDirs: "/d" }),
      scan: scanned([{ path: "/d/new.md", hash: "h-new" }, { path: "/d/same.md", hash: "h-same" }, { path: "/d/changed.md", hash: "h-2" }]),
      listExisting: async () => [
        { id: "1", filename: "/d/same.md", contentHash: "h-same" },
        { id: "2", filename: "/d/changed.md", contentHash: "h-1" },
        { id: "3", filename: "/d/gone.md", contentHash: "h-x" },
      ],
    });
    expect(plan.add).toEqual(["/d/new.md"]);
    expect(plan.update).toEqual(["/d/changed.md"]);
    expect(plan.delete).toEqual(["/d/gone.md"]);
  });

  it("errors when documentsDirs is empty", async () => {
    await expect(planSync({
      getSettings: async () => ({ ...settings, documentsDirs: "" }),
      scan: scanned([]), listExisting: async () => [],
    })).rejects.toThrow(/no documents/i);
  });
});

describe("applySync", () => {
  it("ingests adds/updates and deletes removed, intersected with the fresh plan", async () => {
    const ingest = vi.fn(async () => ({ documentId: "x", chunkCount: 1, skipped: 0, status: "ready" as const }));
    const del = vi.fn(async () => true);
    const createDocument = vi.fn(async () => ({ id: "n", created: true }));
    const setStatus = vi.fn(async () => {});
    const result = await applySync(
      { add: ["/d/new.md"], update: ["/d/changed.md"], delete: ["/d/gone.md"] },
      {
        // fresh plan matches submitted plan exactly
        plan: async () => ({ add: ["/d/new.md"], update: ["/d/changed.md"], delete: ["/d/gone.md"], dirs: ["/d"], errors: [] }),
        scanIndex: async () => new Map([
          ["/d/new.md", { hash: "h-new", baseDir: "/d", root: "/d" }],
          ["/d/changed.md", { hash: "h-2", baseDir: "/d", root: "/d" }],
        ]),
        listExisting: async () => [
          { id: "2", filename: "/d/changed.md", contentHash: "h-1" },
          { id: "3", filename: "/d/gone.md", contentHash: "h-x" },
        ],
        getSettings: async () => settings,
        documentRepo: { createDocument, setStatus } as never,
        vectorStore: {} as never,
        deleteDocumentFn: del,
        ingest,
        readFileFn: async () => Buffer.from("x"),
        assignDefaultWorkspace: async () => {},
        schedule: (fn) => { void fn(); },
      },
    );
    expect(result).toEqual({ added: 1, updated: 1, deleted: 1 });
    expect(del).toHaveBeenCalledWith("2", expect.anything()); // update deletes first
    expect(del).toHaveBeenCalledWith("3", expect.anything()); // removed
    expect(createDocument).toHaveBeenCalledTimes(2); // add + update re-create
  });

  it("never deletes a path the fresh plan does not include", async () => {
    const del = vi.fn(async () => true);
    await applySync(
      { add: [], update: [], delete: ["/d/gone.md"] },
      {
        plan: async () => ({ add: [], update: [], delete: [], dirs: ["/d"], errors: [] }), // fresh plan: nothing to delete
        scanIndex: async () => new Map(),
        listExisting: async () => [],
        getSettings: async () => settings,
        documentRepo: { createDocument: vi.fn(), setStatus: vi.fn() } as never,
        vectorStore: {} as never,
        deleteDocumentFn: del,
        ingest: vi.fn(),
        readFileFn: async () => Buffer.from("x"),
        assignDefaultWorkspace: async () => {},
        schedule: (fn) => { void fn(); },
      },
    );
    expect(del).not.toHaveBeenCalled();
  });

  it("skips an update whose file vanished from the scan index at apply time", async () => {
    const del = vi.fn(async () => true);
    const createDocument = vi.fn(async () => ({ id: "n", created: true }));
    const result = await applySync(
      { add: [], update: ["/d/changed.md"], delete: [] },
      {
        // fresh plan still lists the update, but the file is gone from the scan index
        plan: async () => ({ add: [], update: ["/d/changed.md"], delete: [], dirs: ["/d"], errors: [] }),
        scanIndex: async () => new Map(),
        listExisting: async () => [
          { id: "2", filename: "/d/changed.md", contentHash: "h-1" },
        ],
        getSettings: async () => settings,
        documentRepo: { createDocument, setStatus: vi.fn() } as never,
        vectorStore: {} as never,
        deleteDocumentFn: del,
        ingest: vi.fn(),
        readFileFn: async () => Buffer.from("x"),
        assignDefaultWorkspace: async () => {},
        schedule: (fn) => { void fn(); },
      },
    );
    // Old doc must survive and the update must not be counted.
    expect(del).not.toHaveBeenCalled();
    expect(createDocument).not.toHaveBeenCalled();
    expect(result).toEqual({ added: 0, updated: 0, deleted: 0 });
  });
});
