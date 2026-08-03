import { eq, inArray } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { workspaces, documentWorkspaces, imageWorkspaces, userWorkspaces, users } from "@/lib/db/schema";

// Thin Postgres gateway for workspace membership/access. Always Postgres,
// independent of VECTOR_STORE. Injectable db for tests.
export interface WorkspaceRepo {
  getDefaultId(): Promise<string>;
  listAllIds(): Promise<string[]>;
  listGrantedIds(userId: string): Promise<string[]>;
  isAdmin(userId: string): Promise<boolean>;
  documentIdsIn(workspaceIds: string[]): Promise<string[]>;
  imageIdsIn(workspaceIds: string[]): Promise<string[]>;
}

// Narrowed to just the one method this needs. A drizzle transaction handle
// (`tx` inside `database.transaction(async (tx) => ...)`) is a different type
// than `typeof defaultDb` — it lacks `$client`, `transaction` etc. — so typing
// this parameter as the full `typeof defaultDb` would refuse a `tx` argument
// even though `tx.select(...)` is exactly the same call shape.
type SelectableDb = Pick<typeof defaultDb, "select">;

// Resolves the default (General) workspace id, backing getDefaultId. Exported
// so callers running inside their own transaction (e.g. deleteWorkspace) can
// reuse this exact query and error string instead of re-deriving both.
export async function selectDefaultId(db: SelectableDb): Promise<string> {
  const [row] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.isDefault, true)).limit(1);
  // Not "run migrations": on a non-pgvector project the schema comes from
  // `db:generate`, which emits DDL only. `seed:admin` is what creates this row.
  if (!row) throw new Error('default workspace (General) not found — run `npm run seed:admin`');
  return row.id;
}

export function createWorkspaceRepo(db = defaultDb): WorkspaceRepo {
  return {
    async getDefaultId() {
      return selectDefaultId(db);
    },
    async listAllIds() {
      const rows = await db.select({ id: workspaces.id }).from(workspaces);
      return rows.map((r) => r.id);
    },
    async listGrantedIds(userId) {
      const rows = await db.select({ id: userWorkspaces.workspaceId }).from(userWorkspaces).where(eq(userWorkspaces.userId, userId));
      return rows.map((r) => r.id);
    },
    async isAdmin(userId) {
      const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
      return row?.role === "admin";
    },
    async documentIdsIn(workspaceIds) {
      if (workspaceIds.length === 0) return [];
      const rows = await db.selectDistinct({ id: documentWorkspaces.documentId }).from(documentWorkspaces).where(inArray(documentWorkspaces.workspaceId, workspaceIds));
      return rows.map((r) => r.id);
    },
    async imageIdsIn(workspaceIds) {
      if (workspaceIds.length === 0) return [];
      const rows = await db.selectDistinct({ id: imageWorkspaces.imageId }).from(imageWorkspaces).where(inArray(imageWorkspaces.workspaceId, workspaceIds));
      return rows.map((r) => r.id);
    },
  };
}
