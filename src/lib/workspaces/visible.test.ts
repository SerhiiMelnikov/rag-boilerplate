import { describe, it, expect, vi } from "vitest";
import { listVisibleWorkspaces } from "./visible";

const ALL = [
  { id: "w1", name: "General", description: null, isDefault: true, createdAt: new Date(0) },
  { id: "w2", name: "Marketing", description: null, isDefault: false, createdAt: new Date(0) },
  { id: "w3", name: "Finance", description: null, isDefault: false, createdAt: new Date(0) },
];

function deps(visibleIds: string[]) {
  return {
    listWorkspacesFn: (async () => ALL) as never,
    workspaceRepo: {
      getDefaultId: async () => "w1",
      listAllIds: async () => ALL.map((w) => w.id),
      listGrantedIds: async () => visibleIds.filter((id) => id !== "w1"),
      isAdmin: async () => false,
    } as never,
  };
}

describe("listVisibleWorkspaces", () => {
  it("returns only the workspaces the user can see, in the server's order", async () => {
    expect(await listVisibleWorkspaces("u1", deps(["w1", "w2"]))).toEqual([
      { id: "w1", name: "General", isDefault: true },
      { id: "w2", name: "Marketing", isDefault: false },
    ]);
  });

  it("returns just General for a user with no grants", async () => {
    expect(await listVisibleWorkspaces("u1", deps(["w1"]))).toEqual([
      { id: "w1", name: "General", isDefault: true },
    ]);
  });

  it("returns every workspace for an admin", async () => {
    const d = deps([]);
    (d.workspaceRepo as unknown as { isAdmin: () => Promise<boolean> }).isAdmin = async () => true;
    const out = await listVisibleWorkspaces("admin", d);
    expect(out.map((w) => w.id)).toEqual(["w1", "w2", "w3"]);
  });

  it("never leaks description or createdAt", async () => {
    const [first] = await listVisibleWorkspaces("u1", deps(["w1"]));
    expect(Object.keys(first).sort()).toEqual(["id", "isDefault", "name"]);
  });
});
