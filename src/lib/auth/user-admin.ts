import { desc, eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getAuthUserById } from "./users";

export class SuperAdminProtectedError extends Error {
  constructor() { super("The super-admin cannot be blocked or have their role changed."); this.name = "SuperAdminProtectedError"; }
}
export class SelfActionError extends Error {
  constructor() { super("You cannot block or change the role of your own account."); this.name = "SelfActionError"; }
}
export class UserNotFoundError extends Error {
  constructor() { super("User not found."); this.name = "UserNotFoundError"; }
}

export async function listUsers(database = defaultDb) {
  return database
    .select({ id: users.id, email: users.email, role: users.role, isSuperAdmin: users.isSuperAdmin, blockedAt: users.blockedAt, createdAt: users.createdAt })
    .from(users)
    .orderBy(desc(users.createdAt));
}

// Shared guard: load the target, forbid acting on self or on the super-admin.
async function guardTarget(targetId: string, actorId: string, database: typeof defaultDb) {
  if (targetId === actorId) throw new SelfActionError();
  const target = await getAuthUserById(targetId, database);
  if (!target) throw new UserNotFoundError();
  if (target.isSuperAdmin) throw new SuperAdminProtectedError();
  return target;
}

export async function setUserRole(targetId: string, role: "admin" | "user", actorId: string, database = defaultDb): Promise<void> {
  await guardTarget(targetId, actorId, database);
  await database.update(users).set({ role }).where(eq(users.id, targetId));
}

export async function setUserBlocked(targetId: string, blocked: boolean, actorId: string, database = defaultDb): Promise<void> {
  await guardTarget(targetId, actorId, database);
  await database.update(users).set({ blockedAt: blocked ? new Date() : null }).where(eq(users.id, targetId));
}
