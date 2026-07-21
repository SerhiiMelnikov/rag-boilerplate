import { describe, it, expect, vi } from "vitest";
import { listConversationsResponse, createConversationResponse } from "./handler";
import { UnauthorizedError } from "@/lib/auth/guards";
import type { WorkspaceRepo } from "@/lib/workspaces/repo";

const user = vi.fn(async () => ({ id: "u1", role: "user", isSuperAdmin: false }));

// Fake workspace repo: user sees only General (ws-general). No cookie is set in
// these tests, so resolveActiveWorkspaceId always falls back to General.
const workspaceRepo: WorkspaceRepo = {
  getDefaultId: async () => "ws-general",
  listAllIds: async () => ["ws-general"],
  listGrantedIds: async () => [],
  isAdmin: async () => false,
  documentIdsIn: async () => [],
  imageIdsIn: async () => [],
};

const req = (cookie?: string) => new Request("http://localhost/api/conversations", { headers: cookie ? { cookie } : {} });
const postReq = (cookie?: string) => new Request("http://localhost/api/conversations", { method: "POST", headers: cookie ? { cookie } : {} });

describe("listConversationsResponse", () => {
  it("401s an anonymous caller", async () => {
    const listConversationsFn = vi.fn();
    const res = await listConversationsResponse(req(), {
      getUser: (async () => { throw new UnauthorizedError(); }) as never,
      listConversationsFn: listConversationsFn as never,
      workspaceRepo,
    });
    expect(res.status).toBe(401);
    expect(listConversationsFn).not.toHaveBeenCalled();
  });

  it("returns the user's conversations, scoped to the resolved active workspace", async () => {
    const listConversationsFn = vi.fn(async () => [{ id: "c1", title: "t", createdAt: new Date(0) }]);
    const res = await listConversationsResponse(req("active_workspace=ws-general"), {
      getUser: user as never,
      listConversationsFn: listConversationsFn as never,
      workspaceRepo,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).conversations).toHaveLength(1);
    expect(listConversationsFn).toHaveBeenCalledWith("u1", "ws-general");
  });
});

describe("createConversationResponse", () => {
  it("401s an anonymous caller", async () => {
    const createConversationFn = vi.fn();
    const res = await createConversationResponse(postReq(), {
      getUser: (async () => { throw new UnauthorizedError(); }) as never,
      createConversationFn: createConversationFn as never,
      workspaceRepo,
    });
    expect(res.status).toBe(401);
    expect(createConversationFn).not.toHaveBeenCalled();
  });

  it("creates a conversation stamped with the resolved active workspace", async () => {
    const createConversationFn = vi.fn(async () => ({ id: "c1" }));
    const res = await createConversationResponse(postReq("active_workspace=ws-general"), {
      getUser: user as never,
      createConversationFn: createConversationFn as never,
      workspaceRepo,
    });
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("c1");
    expect(createConversationFn).toHaveBeenCalledWith("u1", "New conversation", "ws-general");
  });
});
