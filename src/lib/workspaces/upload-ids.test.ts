import { describe, it, expect } from "vitest";
import { resolveUploadWorkspaceIds } from "./upload-ids";

const repo = { getDefaultId: async () => "ws-general" } as never;

describe("resolveUploadWorkspaceIds", () => {
  it("defaults to General when the field is absent", async () => {
    expect(await resolveUploadWorkspaceIds(new FormData(), repo)).toEqual(["ws-general"]);
  });
  it("returns the posted ids", async () => {
    const f = new FormData();
    f.append("workspaceIds", "w1");
    f.append("workspaceIds", "w2");
    expect(await resolveUploadWorkspaceIds(f, repo)).toEqual(["w1", "w2"]);
  });
  it("treats a single empty entry as an explicit empty set", async () => {
    const f = new FormData();
    f.append("workspaceIds", "");
    expect(await resolveUploadWorkspaceIds(f, repo)).toEqual([]);
  });
});
