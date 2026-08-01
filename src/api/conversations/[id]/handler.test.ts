import { describe, it, expect, vi } from "vitest";
import { getConversationResponse, deleteConversationResponse, patchConversationResponse } from "./handler";
import { getConversationWithMessages } from "@/lib/chat/conversations";
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

  it("never puts source provenance on the wire", async () => {
    // The guard the design names, at the boundary the browser actually sees:
    // documentId / filename / chunkId stay server-side, and `sourceCount` is the
    // only provenance that crosses. The real query function runs here against a
    // database stand-in that honours the projection — whatever field names the
    // select asks for is what comes back, out of a stored row that does carry the
    // sources jsonb. So a projection "simplified" back to select().from(messages)
    // (modelled by the no-arguments branch below) puts the forbidden keys straight
    // into this response body, and this test is what notices.
    const storedMessage = {
      id: "m1",
      role: "assistant" as const,
      content: "Refunds take 5 days.",
      images: [],
      rating: null,
      sources: [{ documentId: "d1", filename: "handbook.pdf", chunkId: "ch-7", score: 0.91 }],
      usage: null,
      createdAt: new Date(0),
    };
    const project = (fields?: Record<string, unknown>) => {
      // select() with no field map returns every column of the row, sources included.
      if (!fields) return storedMessage;
      return Object.fromEntries(
        Object.keys(fields).map((key) => [
          key,
          key === "sourceCount" ? storedMessage.sources.length : storedMessage[key as keyof typeof storedMessage],
        ]),
      );
    };
    const db = {
      select: (fields?: Record<string, unknown>) => ({
        from: () => ({
          where: () => ({
            // The ownership check ends in .limit(), the message query in .orderBy().
            limit: async () => [{ id: "c1", title: "Refunds" }],
            orderBy: async () => [project(fields)],
          }),
        }),
      }),
    } as never;

    const res = await getConversationResponse(url, "c1", {
      getUser: user as never,
      getConversationWithMessagesFn: ((userId: string, id: string) =>
        getConversationWithMessages(userId, id, db)) as never,
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    for (const forbidden of ["documentId", "filename", "chunkId"]) {
      expect(body, `${forbidden} must never reach the client`).not.toContain(forbidden);
    }
    // The value that replaces them, so this test also fails if the count is dropped
    // rather than the leak being fixed by sending nothing at all.
    expect(JSON.parse(body).messages[0].sourceCount).toBe(1);
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
