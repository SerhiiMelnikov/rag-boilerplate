import { describe, it, expect, vi } from "vitest";
import { getConversationResponse, deleteConversationResponse } from "./handler";
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
