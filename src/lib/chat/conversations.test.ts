import { describe, it, expect } from "vitest";
import {
  createConversation, listConversations, getConversationWithMessages,
  deleteConversation, addMessage, setRating,
} from "@/lib/chat/conversations";

describe("createConversation", () => {
  it("inserts and returns the new id", async () => {
    const db = { insert: () => ({ values: () => ({ returning: async () => [{ id: "c1" }] }) }) } as any;
    expect(await createConversation("u1", "Hello", db)).toEqual({ id: "c1" });
  });
});

describe("listConversations", () => {
  it("returns the user's conversations", async () => {
    const rows = [{ id: "c1", title: "t", createdAt: new Date(0) }];
    const db = { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => rows }) }) }) } as any;
    expect(await listConversations("u1", db)).toEqual(rows);
  });
});

describe("deleteConversation", () => {
  it("returns true when a row was deleted", async () => {
    const db = { delete: () => ({ where: () => ({ returning: async () => [{ id: "c1" }] }) }) } as any;
    expect(await deleteConversation("u1", "c1", db)).toBe(true);
  });
  it("returns false when nothing was deleted (not owned)", async () => {
    const db = { delete: () => ({ where: () => ({ returning: async () => [] }) }) } as any;
    expect(await deleteConversation("u1", "c1", db)).toBe(false);
  });
});

describe("addMessage", () => {
  it("inserts a message and returns its id", async () => {
    const db = { insert: () => ({ values: () => ({ returning: async () => [{ id: "m1" }] }) }) } as any;
    const id = await addMessage({ conversationId: "c1", role: "assistant", content: "hi", sources: [], usage: null }, db);
    expect(id).toEqual({ id: "m1" });
  });
});

describe("setRating", () => {
  it("returns true when the owned message was updated", async () => {
    // Two-step: first select+innerJoin for ownership check, then update.
    const db = {
      select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [{ id: "m1" }] }) }) }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ id: "m1" }] }) }) }),
    } as any;
    expect(await setRating("u1", "m1", 1, db)).toBe(true);
  });
  it("returns false when not owned", async () => {
    // Ownership select returns empty; update should not be called.
    const db = {
      select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [] }) }) }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    } as any;
    expect(await setRating("u1", "m1", -1, db)).toBe(false);
  });
});

describe("getConversationWithMessages", () => {
  it("returns null when the conversation is not owned/found", async () => {
    const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) } as any;
    expect(await getConversationWithMessages("u1", "c1", db)).toBeNull();
  });
  it("returns conversation with messages when owned", async () => {
    const conv = { id: "c1", title: "Hello" };
    const msg = { id: "m1", role: "assistant", content: "hi", sources: [], rating: null, usage: null, createdAt: new Date(0) };
    let callCount = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              callCount++;
              return callCount === 1 ? [conv] : [];
            },
            orderBy: async () => [msg],
          }),
        }),
      }),
    } as any;
    const result = await getConversationWithMessages("u1", "c1", db);
    expect(result).toEqual({ id: "c1", title: "Hello", messages: [msg] });
  });
});
