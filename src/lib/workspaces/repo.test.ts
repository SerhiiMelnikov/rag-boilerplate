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
});
