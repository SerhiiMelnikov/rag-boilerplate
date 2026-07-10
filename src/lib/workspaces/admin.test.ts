import { describe, it, expect, vi } from "vitest";
import {
  createWorkspace, updateWorkspace, deleteWorkspace,
  WorkspaceNotFoundError, DefaultWorkspaceProtectedError, DuplicateWorkspaceNameError,
} from "./admin";

// Fake db: `found` is the row loadWorkspace() reads (null = not found);
// `insertReturns` is what insert().returning() yields ([] = unique conflict);
// `clash` is the rename collision probe row (null = no clash).
function fakeDb(opts: { found?: { id: string; isDefault: boolean } | null; insertReturns?: { id: string }[]; clash?: { id: string } | null } = {}) {
  const set = vi.fn(() => ({ where: async () => {} }));
  const del = vi.fn(() => ({ where: async () => {} }));
  let selectCall = 0;
  return {
    _set: set,
    _delete: del,
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            selectCall += 1;
            // 1st select = loadWorkspace, 2nd = rename-clash probe
            if (selectCall === 1) return opts.found === null ? [] : [opts.found ?? { id: "w1", isDefault: false }];
            return opts.clash ? [opts.clash] : [];
          },
        }),
      }),
    }),
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => opts.insertReturns ?? [{ id: "new-1" }] }) }) }),
    update: () => ({ set }),
    delete: del,
  } as never;
}

describe("createWorkspace", () => {
  it("returns the new id", async () => {
    expect(await createWorkspace({ name: "Marketing" }, fakeDb())).toBe("new-1");
  });
  it("throws DuplicateWorkspaceNameError when the name is taken", async () => {
    await expect(createWorkspace({ name: "General" }, fakeDb({ insertReturns: [] }))).rejects.toBeInstanceOf(DuplicateWorkspaceNameError);
  });
});

describe("updateWorkspace", () => {
  it("404s on an unknown workspace", async () => {
    await expect(updateWorkspace("nope", { name: "x" }, fakeDb({ found: null }))).rejects.toBeInstanceOf(WorkspaceNotFoundError);
  });
  it("refuses to rename the General workspace", async () => {
    await expect(updateWorkspace("w1", { name: "x" }, fakeDb({ found: { id: "w1", isDefault: true } }))).rejects.toBeInstanceOf(DefaultWorkspaceProtectedError);
  });
  it("allows editing General's description", async () => {
    const db = fakeDb({ found: { id: "w1", isDefault: true } });
    await updateWorkspace("w1", { description: "the shared space" }, db);
    expect((db as any)._set).toHaveBeenCalledWith({ description: "the shared space" });
  });
  it("throws Duplicate when renaming onto an existing name", async () => {
    await expect(updateWorkspace("w1", { name: "Taken" }, fakeDb({ clash: { id: "w2" } }))).rejects.toBeInstanceOf(DuplicateWorkspaceNameError);
  });
  it("renames a normal workspace", async () => {
    const db = fakeDb();
    await updateWorkspace("w1", { name: "Sales" }, db);
    expect((db as any)._set).toHaveBeenCalledWith({ name: "Sales" });
  });
});

describe("deleteWorkspace", () => {
  it("404s on an unknown workspace", async () => {
    await expect(deleteWorkspace("nope", fakeDb({ found: null }))).rejects.toBeInstanceOf(WorkspaceNotFoundError);
  });
  it("refuses to delete the General workspace", async () => {
    await expect(deleteWorkspace("w1", fakeDb({ found: { id: "w1", isDefault: true } }))).rejects.toBeInstanceOf(DefaultWorkspaceProtectedError);
  });
  it("deletes a normal workspace", async () => {
    const db = fakeDb();
    await deleteWorkspace("w1", db);
    expect((db as any)._delete).toHaveBeenCalled();
  });
});
