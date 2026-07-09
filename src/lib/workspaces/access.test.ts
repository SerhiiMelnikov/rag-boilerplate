import { describe, it, expect } from "vitest";
import type { WorkspaceRepo } from "./repo";
import {
  resolveVisibleWorkspaceIds, resolveActiveWorkspaceId,
  resolveAllowedDocumentIds, resolveAllowedImageIds,
} from "./access";

const GENERAL = "ws-general";

function fakeRepo(over: Partial<WorkspaceRepo> = {}): WorkspaceRepo {
  return {
    getDefaultId: async () => GENERAL,
    listAllIds: async () => [GENERAL, "ws-a", "ws-b"],
    listGrantedIds: async () => [],
    isAdmin: async () => false,
    documentIdsIn: async (ids) => ids.flatMap((w) => (w === GENERAL ? ["dG"] : w === "ws-a" ? ["dA"] : [])),
    imageIdsIn: async (ids) => ids.flatMap((w) => (w === GENERAL ? ["iG"] : w === "ws-a" ? ["iA"] : [])),
    addDocumentToDefault: async () => {},
    addImageToDefault: async () => {},
    ...over,
  };
}

describe("resolveVisibleWorkspaceIds", () => {
  it("is General + granted for a normal user", async () => {
    const repo = fakeRepo({ listGrantedIds: async () => ["ws-a"] });
    expect(await resolveVisibleWorkspaceIds("u1", repo)).toEqual([GENERAL, "ws-a"]);
  });

  it("is every workspace for an admin", async () => {
    const repo = fakeRepo({ isAdmin: async () => true });
    expect(await resolveVisibleWorkspaceIds("admin", repo)).toEqual([GENERAL, "ws-a", "ws-b"]);
  });

  it("dedupes when General is also granted", async () => {
    const repo = fakeRepo({ listGrantedIds: async () => [GENERAL, "ws-a"] });
    expect(await resolveVisibleWorkspaceIds("u1", repo)).toEqual([GENERAL, "ws-a"]);
  });
});

describe("resolveActiveWorkspaceId", () => {
  it("keeps a requested workspace the user can see", async () => {
    const repo = fakeRepo({ listGrantedIds: async () => ["ws-a"] });
    expect(await resolveActiveWorkspaceId("ws-a", "u1", repo)).toBe("ws-a");
  });

  it("falls back to General for an inaccessible workspace", async () => {
    const repo = fakeRepo({ listGrantedIds: async () => ["ws-a"] });
    expect(await resolveActiveWorkspaceId("ws-b", "u1", repo)).toBe(GENERAL);
  });

  it("falls back to General when nothing is requested", async () => {
    expect(await resolveActiveWorkspaceId(null, "u1", fakeRepo())).toBe(GENERAL);
  });
});

describe("resolveAllowed*Ids", () => {
  it("unions the active workspace with General (documents)", async () => {
    expect((await resolveAllowedDocumentIds("ws-a", fakeRepo())).sort()).toEqual(["dA", "dG"]);
  });

  it("returns just General's ids when active IS General (no duplicate scope)", async () => {
    expect(await resolveAllowedImageIds(GENERAL, fakeRepo())).toEqual(["iG"]);
  });
});
