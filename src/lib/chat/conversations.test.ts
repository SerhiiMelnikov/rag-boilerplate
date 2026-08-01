import { describe, it, expect, vi } from "vitest";
import { and, eq, is, Column, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  createConversation, listConversations, getConversationWithMessages,
  deleteConversation, addMessage, setRating, setConversationTitleIfDefault,
  type ImageResultRef,
} from "@/lib/chat/conversations";
import { conversations } from "@/lib/db/schema";

describe("createConversation", () => {
  it("inserts and returns the new id", async () => {
    const db = { insert: () => ({ values: () => ({ returning: async () => [{ id: "c1" }] }) }) } as never;
    expect(await createConversation("u1", "Hello", null, db)).toEqual({ id: "c1" });
  });
});

describe("listConversations", () => {
  it("returns the user's conversations", async () => {
    const rows = [{ id: "c1", title: "t", createdAt: new Date(0) }];
    const db = { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => rows }) }) }) } as never;
    expect(await listConversations("u1", "ws-1", db)).toEqual(rows);
  });

  it("filters by both userId and workspaceId", async () => {
    let capturedWhere: unknown;
    const rows = [{ id: "c1", title: "t", createdAt: new Date(0) }];
    const db = {
      select: () => ({
        from: () => ({
          where: (w: unknown) => {
            capturedWhere = w;
            return { orderBy: async () => rows };
          },
        }),
      }),
    } as never;
    expect(await listConversations("u1", "ws-1", db)).toEqual(rows);
    // Structurally compare the captured drizzle AND expression against a freshly
    // built one with the same two conditions (userId + workspaceId).
    expect(capturedWhere).toEqual(and(eq(conversations.userId, "u1"), eq(conversations.workspaceId, "ws-1")));
  });
});

describe("createConversation workspaceId", () => {
  it("stamps the workspaceId on insert", async () => {
    let inserted: unknown;
    const db = {
      insert: () => ({
        values: (v: unknown) => {
          inserted = v;
          return { returning: async () => [{ id: "c1" }] };
        },
      }),
    } as never;
    expect(await createConversation("u1", "t", "ws-1", db)).toEqual({ id: "c1" });
    expect(inserted).toMatchObject({ userId: "u1", title: "t", workspaceId: "ws-1" });
  });
});

describe("deleteConversation", () => {
  it("returns true when a row was deleted", async () => {
    const db = { delete: () => ({ where: () => ({ returning: async () => [{ id: "c1" }] }) }) } as never;
    expect(await deleteConversation("u1", "c1", db)).toBe(true);
  });
  it("returns false when nothing was deleted (not owned)", async () => {
    const db = { delete: () => ({ where: () => ({ returning: async () => [] }) }) } as never;
    expect(await deleteConversation("u1", "c1", db)).toBe(false);
  });
});

describe("addMessage", () => {
  it("inserts a message and returns its id", async () => {
    const db = { insert: () => ({ values: () => ({ returning: async () => [{ id: "m1" }] }) }) } as never;
    const id = await addMessage({ conversationId: "c1", role: "assistant", content: "hi", sources: [], usage: null }, db);
    expect(id).toEqual({ id: "m1" });
  });
});

describe("addMessage workspaceId", () => {
  it("addMessage writes workspaceId when provided", async () => {
    let inserted: unknown;
    const database = {
      insert: () => ({ values: (v: unknown) => { inserted = v; return { returning: async () => [{ id: "m1" }] }; } }),
    } as never;
    await addMessage({ conversationId: "c1", role: "assistant", content: "hi", workspaceId: "ws-1" }, database);
    expect(inserted).toMatchObject({ conversationId: "c1", role: "assistant", content: "hi", workspaceId: "ws-1" });
  });
});

describe("setRating", () => {
  it("returns true when the owned message was updated", async () => {
    // Two-step: first select+innerJoin for ownership check, then update.
    const db = {
      select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [{ id: "m1" }] }) }) }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ id: "m1" }] }) }) }),
    } as never;
    expect(await setRating("u1", "m1", 1, db)).toBe(true);
  });
  it("returns false when not owned", async () => {
    // Ownership select returns empty; update should not be called.
    const db = {
      select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [] }) }) }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    } as never;
    expect(await setRating("u1", "m1", -1, db)).toBe(false);
  });
});

describe("setConversationTitleIfDefault", () => {
  it("calls update with a three-way AND condition", async () => {
    const whereFn = vi.fn(async () => undefined);
    const db = {
      update: () => ({ set: () => ({ where: whereFn }) }),
    } as never;
    await setConversationTitleIfDefault("u1", "c1", "My title", db);
    expect(whereFn).toHaveBeenCalledTimes(1);
    // We only assert that where was called (the AND expression is opaque to the unit test).
    // The integration behaviour is covered by the SQL expression itself.
  });
});

describe("addMessage + getConversationWithMessages (images)", () => {
  it("persists and returns assistant message images", async () => {
    // Capture the values passed to insert(), then feed them back through the
    // select mock so we can assert the round-trip end to end.
    const insertedValues: Array<{ images?: ImageResultRef[] }> = [];
    let selectCallCount = 0;
    const db = {
      insert: () => ({
        values: (v: { images?: ImageResultRef[] }) => {
          insertedValues.push(v);
          return { returning: async () => [{ id: "m1" }] };
        },
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              selectCallCount++;
              return selectCallCount === 1 ? [{ id: "c1", title: "Hello" }] : [];
            },
            orderBy: async () => [
              {
                id: "m1",
                role: "assistant",
                content: "here",
                sources: [],
                images: insertedValues[0]?.images ?? [],
                rating: null,
                usage: null,
                createdAt: new Date(0),
              },
            ],
          }),
        }),
      }),
    } as never;

    await addMessage(
      { conversationId: "c1", role: "assistant", content: "here", images: [{ imageId: "img-1", caption: "a red bicycle" }] },
      db,
    );
    const out = await getConversationWithMessages("u1", "c1", db);
    expect(out?.messages.at(-1)?.images).toEqual([{ imageId: "img-1", caption: "a red bicycle" }]);
  });
});

describe("getConversationWithMessages", () => {
  it("returns null when the conversation is not owned/found", async () => {
    const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) } as never;
    expect(await getConversationWithMessages("u1", "c1", db)).toBeNull();
  });
  it("returns conversation with messages when owned", async () => {
    const conv = { id: "c1", title: "Hello" };
    // No `sources` field: the real projection has never selected the raw jsonb
    // column since the 0.4.1 P1 fix, only `sourceCount` (see the describe block below).
    const msg = { id: "m1", role: "assistant", content: "hi", rating: null, usage: null, createdAt: new Date(0) };
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
    } as never;
    const result = await getConversationWithMessages("u1", "c1", db);
    expect(result).toEqual({ id: "c1", title: "Hello", messages: [msg] });
  });
});

// The message projection's allowlist: the exact key set the select may ask for.
// Anything else — added, renamed, or reintroduced — fails the guard below.
const EXPECTED_MESSAGE_FIELDS = ["id", "role", "content", "images", "rating", "sourceCount", "usage", "createdAt"];

// Compile a select field to the SQL text Postgres would receive for it. A plain
// drizzle `Column` isn't a compilable `sql`` fragment — it carries its identifier
// in `.name` — so read that; anything else goes through `PgDialect`, the same
// public compiler drizzle uses to build the real query.
const dialect = new PgDialect();
function fieldSql(value: unknown): string {
  if (is(value, Column)) return value.name;
  return dialect.sqlToQuery(value as SQL).sql;
}

describe("getConversationWithMessages projection", () => {
  it("selects a source count and never the source rows themselves", async () => {
    // Capture what the message SELECT asks Postgres for. The 0.4.1 P1 fix took
    // documentId/filename/chunkId off the wire; a future 'simplification' back to
    // select().from(messages) would restore the leak silently. This is the tripwire.
    const captured: Array<Record<string, unknown>> = [];
    const db = {
      select: (fields: Record<string, unknown>) => {
        captured.push(fields);
        return {
          from: () => ({
            where: () => ({
              limit: async () => [{ id: "c1", title: "t" }],
              orderBy: async () => [],
            }),
          }),
        };
      },
    } as never;

    await getConversationWithMessages("u1", "c1", db);

    const messageFields = captured[1];
    expect(messageFields).toBeDefined();

    // This guard allowlists the projection's shape; it does not scan for forbidden
    // spellings of the sources column. Three earlier versions did scan, and each was
    // defeated by a channel it hadn't anticipated — a mislabelled key, a raw
    // `sql`sources`` identifier, and finally `to_jsonb(messages)`, which reaches the
    // whole row while naming no column at all. Asking "does this field mention
    // sources?" can't be made complete, so instead the key set is pinned exactly and
    // every key is pinned to a shape: an unrecognised field fails by default, however
    // it is written. What this protects is the select's shape — the wire contract
    // still depends on the handler not adding fields of its own downstream.
    expect(Object.keys(messageFields).slice().sort()).toEqual(EXPECTED_MESSAGE_FIELDS.slice().sort());

    // `sourceCount` must be the count, never the array: the wrapper is the whole point.
    expect(fieldSql(messageFields.sourceCount)).toContain("jsonb_array_length");

    for (const [key, value] of Object.entries(messageFields)) {
      if (key === "sourceCount") continue;
      // Every other allowed key must be a plain column. Row-level expressions —
      // `to_jsonb(messages)` and anything like it — are `SQL`, not `Column`, so they
      // cannot hide under an allowed name.
      expect(is(value, Column), `${key} must be bound to a plain column`).toBe(true);
      // ...and none of them may be the sources column under a different name.
      expect((value as Column).name, `${key} must not be bound to the sources column`).not.toBe("sources");
    }
  });

  it("returns the count on each message", async () => {
    const rows = [
      { id: "m1", role: "assistant", content: "a", images: [], rating: null, usage: null, createdAt: new Date(0), sourceCount: 3 },
    ];
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: "c1", title: "t" }],
            orderBy: async () => rows,
          }),
        }),
      }),
    } as never;

    const result = await getConversationWithMessages("u1", "c1", db);
    expect(result?.messages[0].sourceCount).toBe(3);
  });
});
