import { describe, it, expect, vi } from "vitest";
import { createWorkspaceRepo } from "./repo";

describe("workspace repo (DB-free branches)", () => {
  it("documentIdsIn([]) returns [] without touching the db", async () => {
    const db = { selectDistinct: vi.fn() } as never;
    expect(await createWorkspaceRepo(db).documentIdsIn([])).toEqual([]);
    expect((db as { selectDistinct: ReturnType<typeof vi.fn> }).selectDistinct).not.toHaveBeenCalled();
  });

  it("imageIdsIn([]) returns [] without touching the db", async () => {
    const db = { selectDistinct: vi.fn() } as never;
    expect(await createWorkspaceRepo(db).imageIdsIn([])).toEqual([]);
    expect((db as { selectDistinct: ReturnType<typeof vi.fn> }).selectDistinct).not.toHaveBeenCalled();
  });

  it("addDocumentToDefault inserts a General membership with onConflictDoNothing", async () => {
    const calls: any = {};
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "ws-general" }] }) }) }),
      insert: (t: any) => ({ values: (v: any) => { calls.values = v; return { onConflictDoNothing: async () => { calls.conflict = true; } }; } }),
    } as never;
    await createWorkspaceRepo(db).addDocumentToDefault("doc-1");
    expect(calls.values).toEqual({ documentId: "doc-1", workspaceId: "ws-general" });
    expect(calls.conflict).toBe(true);
  });
});
