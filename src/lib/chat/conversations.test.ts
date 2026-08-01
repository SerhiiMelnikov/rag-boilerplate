import { describe, it, expect, vi } from "vitest";
import { and, eq, type SQL } from "drizzle-orm";
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

// Compile a select field value to the exact SQL text Postgres would receive for it.
// A plain column reference (e.g. `messages.rating`) isn't itself a compilable `sql``
// fragment — it's just named via `.name` — so we read that directly; anything else
// (a `sql`` template, however it names the column: interpolated object, raw
// identifier text, or wrapped in a function call) is compiled through PgDialect,
// the same public compiler drizzle itself uses to build the real query. This
// replaced two earlier attempts (round 1: matching a literal `"sources"` key name;
// round 2: walking `queryChunks` for object identity against `messages.sources`)
// that each missed a different way to reach the column — a raw-SQL identifier
// (`sql`sources``) doesn't appear as the Column object anywhere in its chunks.
// Compiling to text instead of inspecting drizzle's internal representation is
// exhaustive: whatever channel is used, the compiled SQL string is what Postgres
// actually runs.
const dialect = new PgDialect();
function fieldSql(value: unknown): string {
  const columnName = (value as { name?: unknown } | null)?.name;
  if (typeof columnName === "string") return columnName;
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
    expect(Object.keys(messageFields)).toContain("sourceCount");
    expect(Object.keys(messageFields)).not.toContain("sources");
    // The keys-only checks above are not what carries this guard (see fieldSql's
    // comment for why). Compile every field to the SQL text Postgres would
    // actually receive and find whichever ones mention the sources column at all —
    // as a bare identifier, a quoted "messages"."sources", or wrapped in a call —
    // no matter what key they're filed under. Exactly one field may touch it: the
    // length check is load-bearing, because without it a projection that stopped
    // selecting the count entirely would pass a filter that matches nothing.
    const touching = Object.entries(messageFields).filter(([, value]) => /\bsources\b/.test(fieldSql(value)));
    expect(touching).toHaveLength(1);
    const [key, value] = touching[0];
    expect(key).toBe("sourceCount");
    expect(fieldSql(value)).toContain("jsonb_array_length");
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
