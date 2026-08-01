import { describe, it, expect, vi } from "vitest";
import { getConversationResponse, deleteConversationResponse, patchConversationResponse } from "./handler";
import { UnauthorizedError } from "@/lib/auth/guards";

const user = vi.fn(async () => ({ id: "u1", role: "user", isSuperAdmin: false }));
const url = new Request("http://localhost/api/conversations/c1");

describe("getConversationResponse", () => {
  it("401s an anonymous caller", async () => {
    const getConversationWithMessagesFn = vi.fn();
    const res = await getConversationResponse(url, "c1", {
      getUser: (async () => { throw new UnauthorizedError(); }) as never,
      getConversationWithMessagesFn: getConversationWithMessagesFn as never,
    });
    expect(res.status).toBe(401);
    expect(getConversationWithMessagesFn).not.toHaveBeenCalled();
  });

  it("404s when not found/owned", async () => {
    const getConversationWithMessagesFn = vi.fn(async () => null);
    const res = await getConversationResponse(url, "c1", {
      getUser: user as never,
      getConversationWithMessagesFn: getConversationWithMessagesFn as never,
    });
    expect(res.status).toBe(404);
  });

  it("returns the conversation when owned", async () => {
    const getConversationWithMessagesFn = vi.fn(async () => ({ id: "c1", title: "t", messages: [] }));
    const res = await getConversationResponse(url, "c1", {
      getUser: user as never,
      getConversationWithMessagesFn: getConversationWithMessagesFn as never,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("c1");
    expect(getConversationWithMessagesFn).toHaveBeenCalledWith("u1", "c1");
  });
});

describe("deleteConversationResponse", () => {
  it("401s an anonymous caller", async () => {
    const deleteConversationFn = vi.fn();
    const res = await deleteConversationResponse(url, "c1", {
      getUser: (async () => { throw new UnauthorizedError(); }) as never,
      deleteConversationFn: deleteConversationFn as never,
    });
    expect(res.status).toBe(401);
    expect(deleteConversationFn).not.toHaveBeenCalled();
  });

  it("204s when deleted", async () => {
    const deleteConversationFn = vi.fn(async () => true);
    const res = await deleteConversationResponse(url, "c1", {
      getUser: user as never,
      deleteConversationFn: deleteConversationFn as never,
    });
    expect(res.status).toBe(204);
    expect(deleteConversationFn).toHaveBeenCalledWith("u1", "c1");
  });

  it("404s when nothing deleted", async () => {
    const deleteConversationFn = vi.fn(async () => false);
    const res = await deleteConversationResponse(url, "c1", {
      getUser: user as never,
      deleteConversationFn: deleteConversationFn as never,
    });
    expect(res.status).toBe(404);
  });
});

describe("patchConversationResponse", () => {
  const user = { id: "u1", role: "user" as const };
  const req = (body: unknown) =>
    new Request("http://localhost/api/conversations/c1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("renames and echoes the stored title", async () => {
    const renameConversationFn = vi.fn(async () => true);
    const res = await patchConversationResponse(req({ title: "  Quarterly numbers  " }), "c1", {
      getUser: async () => user,
      renameConversationFn,
    } as never);
    expect(res.status).toBe(200);
    // The trimmed value is what was stored, so it is what comes back.
    expect(await res.json()).toEqual({ id: "c1", title: "Quarterly numbers" });
    expect(renameConversationFn).toHaveBeenCalledWith("u1", "c1", "Quarterly numbers");
  });

  it("404s when the conversation is not the caller's", async () => {
    const res = await patchConversationResponse(req({ title: "x" }), "c1", {
      getUser: async () => user,
      renameConversationFn: async () => false,
    } as never);
    // Same status as "does not exist": ownership must not be probeable.
    expect(res.status).toBe(404);
  });

  it("400s on a blank title", async () => {
    const renameConversationFn = vi.fn(async () => true);
    const res = await patchConversationResponse(req({ title: "   " }), "c1", {
      getUser: async () => user,
      renameConversationFn,
    } as never);
    expect(res.status).toBe(400);
    expect(renameConversationFn).not.toHaveBeenCalled();
  });

  it("400s on a body that is not JSON", async () => {
    const bad = new Request("http://localhost/api/conversations/c1", { method: "PATCH", body: "{" });
    const res = await patchConversationResponse(bad, "c1", { getUser: async () => user } as never);
    expect(res.status).toBe(400);
  });
});
