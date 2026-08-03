// Gated behind RUN_INTEGRATION=1 like the repo's other integration tests. Run:
//   docker compose up -d db && npm run db:migrate && npm run seed:admin
//   RUN_INTEGRATION=1 npx vitest run --config vitest.integration.config.ts \
//     src/lib/workspaces/delete.integration.test.ts
//
// admin.test.ts proves the call shape against a fake. Only a real engine proves
// the outcome: the FK is ON DELETE set null, so whether the conversation ends
// up pointing at General or at nothing depends on statement order inside a
// real transaction, which a fake cannot model.
//
// Every row created here uses a fresh random UUID, so it cannot collide with
// anything already in the developer's shared database. Ids are recorded in
// createdUserIds/createdWorkspaceIds the instant each insert succeeds (not
// computed up front), so afterAll cleans up whatever actually made it into
// the database even if a later insert, or the call under test, throws.
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, workspaces, conversations, messages } from "@/lib/db/schema";
import { deleteWorkspace } from "./admin";

const RUN = process.env.RUN_INTEGRATION === "1";

describe.runIf(RUN)("deleteWorkspace (integration)", () => {
  const createdUserIds: string[] = [];
  const createdWorkspaceIds: string[] = [];

  afterAll(async () => {
    // Users cascade to their conversations/messages. The workspace has no FK
    // from a user, so it needs its own delete — a harmless no-op when
    // deleteWorkspace already removed it, but the only thing standing between
    // a failed run and a workspace row orphaned forever in the shared dev DB.
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
    if (createdWorkspaceIds.length) await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaceIds));
  });

  it("moves the conversation to General and leaves the message's workspace null", async () => {
    const [general] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.isDefault, true)).limit(1);
    expect(general, "run `npm run seed:admin` first").toBeDefined();

    const userId = randomUUID();
    await db.insert(users).values({ id: userId, email: `ws-delete-test-${userId}@example.test`, passwordHash: "x" });
    createdUserIds.push(userId);

    const doomedId = randomUUID();
    await db.insert(workspaces).values({ id: doomedId, name: `ws-delete-test-doomed-${doomedId}` });
    createdWorkspaceIds.push(doomedId);

    const chatId = randomUUID();
    await db.insert(conversations).values({ id: chatId, userId, title: "kept", workspaceId: doomedId });
    await db.insert(messages).values({ conversationId: chatId, role: "user", content: "hi", workspaceId: doomedId });

    await deleteWorkspace(doomedId);

    const [after] = await db.select().from(conversations).where(eq(conversations.id, chatId));
    expect(after, "the conversation row must survive the delete").toBeDefined();
    expect(after.workspaceId).toBe(general!.id);

    const [msg] = await db.select().from(messages).where(eq(messages.conversationId, chatId));
    // Deliberately null: usage analytics groups by this column, and re-badging
    // another workspace's tokens as General would be a false number on a chart.
    expect(msg.workspaceId).toBeNull();
  });
});
