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

export function createWorkspaceRepo(db = defaultDb): WorkspaceRepo {
  return {
    async getDefaultId() {
      const [row] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.isDefault, true)).limit(1);
      if (!row) throw new Error("default workspace (General) not found — run migrations");
      return row.id;
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
