import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { workspaces, userWorkspaces, users, conversations } from "@/lib/db/schema";
import { selectDefaultId } from "./repo";

export class WorkspaceNotFoundError extends Error {
  constructor() { super("Workspace not found."); this.name = "WorkspaceNotFoundError"; }
}
export class DefaultWorkspaceProtectedError extends Error {
  constructor(message = "The General workspace is protected.") { super(message); this.name = "DefaultWorkspaceProtectedError"; }
}
export class DuplicateWorkspaceNameError extends Error {
  constructor() { super("A workspace with that name already exists."); this.name = "DuplicateWorkspaceNameError"; }
}

export interface WorkspaceRow {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: Date;
  userCount: number;
}

const COLUMNS = {
  id: workspaces.id,
  name: workspaces.name,
  description: workspaces.description,
  isDefault: workspaces.isDefault,
  createdAt: workspaces.createdAt,
};

// loadWorkspace (below) only ever needs the target's identity/isDefault flag for
// its guards, not the aggregate — that column is listWorkspaces-only, and
// computing it on every rename/delete/grant check would be pure waste.
type WorkspaceTarget = Omit<WorkspaceRow, "userCount">;

// General first, then alphabetical. userCount follows the rule settled in the
// spec, which mirrors listWorkspaceUsers' `granted` flag below: the default
// workspace's access is implicit for every user, so its count is every row in
// `users` — unfiltered, including blocked accounts, exactly what
// listWorkspaceUsers counts — while every other workspace's count is its
// explicit grants in user_workspaces. One query, one aggregate: the total-users
// figure is a scalar subquery the planner evaluates once per group, not a
// second round trip, so this stays N+1-free.
export async function listWorkspaces(database = defaultDb): Promise<WorkspaceRow[]> {
  const userCount = sql<number>`case when ${workspaces.isDefault} then (select count(*)::int from ${users}) else count(${userWorkspaces.userId})::int end`;
  return database
    .select({ ...COLUMNS, userCount })
    .from(workspaces)
    .leftJoin(userWorkspaces, eq(userWorkspaces.workspaceId, workspaces.id))
    .groupBy(workspaces.id)
    .orderBy(desc(workspaces.isDefault), asc(workspaces.name));
}

// Race-safe uniqueness: the unique index decides. No returned row = name taken.
export async function createWorkspace(
  input: { name: string; description?: string | null },
  database = defaultDb,
): Promise<string> {
  const [row] = await database
    .insert(workspaces)
    .values({ name: input.name, description: input.description ?? null })
    .onConflictDoNothing({ target: workspaces.name })
    .returning({ id: workspaces.id });
  if (!row) throw new DuplicateWorkspaceNameError();
  return row.id;
}

// Shared guard: load the target or 404.
async function loadWorkspace(id: string, database: typeof defaultDb): Promise<WorkspaceTarget> {
  const [row] = await database.select(COLUMNS).from(workspaces).where(eq(workspaces.id, id)).limit(1);
  if (!row) throw new WorkspaceNotFoundError();
  return row;
}

export async function updateWorkspace(
  id: string,
  patch: { name?: string; description?: string | null },
  database = defaultDb,
): Promise<void> {
  const target = await loadWorkspace(id, database);
  if (patch.name !== undefined) {
    if (target.isDefault) throw new DefaultWorkspaceProtectedError("The General workspace cannot be renamed.");
    const [clash] = await database
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.name, patch.name), ne(workspaces.id, id)))
      .limit(1);
    if (clash) throw new DuplicateWorkspaceNameError();
  }
  const set: { name?: string; description?: string | null } = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  if (Object.keys(set).length === 0) return;
  await database.update(workspaces).set(set).where(eq(workspaces.id, id));
}

// Deleting cascades memberships + grants (FKs). Conversations are moved to the
// default workspace first, in the same transaction: conversations.workspace_id
// is ON DELETE set null and every sidebar filters on a strict workspace_id = X,
// so a null makes the chat unreachable from every workspace at once while its
// rows sit in the database untouched. The order is load-bearing — after the
// delete there is nothing left to reassign.
//
// messages.workspace_id is deliberately NOT moved: usage analytics groups by
// that column, and re-badging another workspace's tokens as General would put
// a false number on a dashboard. Documents and images are not moved either —
// their membership rows cascade, so one that lived only here becomes
// unassigned, which is visible and fixable on the Files page.
export async function deleteWorkspace(id: string, database = defaultDb): Promise<void> {
  const target = await loadWorkspace(id, database);
  if (target.isDefault) throw new DefaultWorkspaceProtectedError("The General workspace cannot be deleted.");
  await database.transaction(async (tx) => {
    const fallbackId = await selectDefaultId(tx);
    await tx.update(conversations).set({ workspaceId: fallbackId }).where(eq(conversations.workspaceId, id));
    await tx.delete(workspaces).where(eq(workspaces.id, id));
  });
}

export interface WorkspaceUserRow { id: string; email: string; granted: boolean }

// Every user, flagged with whether this workspace is granted to them. General's
// access is implicit for everyone, so all rows come back granted.
export async function listWorkspaceUsers(workspaceId: string, database = defaultDb): Promise<WorkspaceUserRow[]> {
  const target = await loadWorkspace(workspaceId, database);
  const rows = await database
    .select({ id: users.id, email: users.email, grantId: userWorkspaces.userId })
    .from(users)
    .leftJoin(userWorkspaces, and(eq(userWorkspaces.userId, users.id), eq(userWorkspaces.workspaceId, workspaceId)))
    .orderBy(asc(users.email));
  return rows.map((r) => ({ id: r.id, email: r.email, granted: target.isDefault || r.grantId !== null }));
}

export async function setWorkspaceGrant(
  workspaceId: string,
  userId: string,
  granted: boolean,
  database = defaultDb,
): Promise<void> {
  const target = await loadWorkspace(workspaceId, database);
  if (target.isDefault) throw new DefaultWorkspaceProtectedError("Everyone already has access to the General workspace.");
  if (granted) {
    await database.insert(userWorkspaces).values({ userId, workspaceId }).onConflictDoNothing();
  } else {
    await database.delete(userWorkspaces).where(and(eq(userWorkspaces.userId, userId), eq(userWorkspaces.workspaceId, workspaceId)));
  }
}
