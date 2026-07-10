import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";

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
}

const COLUMNS = {
  id: workspaces.id,
  name: workspaces.name,
  description: workspaces.description,
  isDefault: workspaces.isDefault,
  createdAt: workspaces.createdAt,
};

// General first, then alphabetical.
export async function listWorkspaces(database = defaultDb): Promise<WorkspaceRow[]> {
  return database.select(COLUMNS).from(workspaces).orderBy(desc(workspaces.isDefault), asc(workspaces.name));
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
async function loadWorkspace(id: string, database: typeof defaultDb): Promise<WorkspaceRow> {
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

// Deleting cascades memberships + grants (FKs). Content stays reachable via General.
export async function deleteWorkspace(id: string, database = defaultDb): Promise<void> {
  const target = await loadWorkspace(id, database);
  if (target.isDefault) throw new DefaultWorkspaceProtectedError("The General workspace cannot be deleted.");
  await database.delete(workspaces).where(eq(workspaces.id, id));
}
