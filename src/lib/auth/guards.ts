import { auth } from "@/auth";
import { getAuthUserById } from "@/lib/auth/users";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}
export class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}

export interface SessionUser {
  id: string;
  role: "admin" | "user";
  isSuperAdmin: boolean;
}

type GuardDeps = { getSession?: typeof auth; getAuthUser?: typeof getAuthUserById };

// Require an authenticated, existing, non-blocked user. One indexed DB lookup so
// a block/deletion takes effect on the next request, not just at next login.
export async function requireUser(deps: GuardDeps = {}): Promise<SessionUser> {
  const getSession = deps.getSession ?? auth;
  const getAuthUser = deps.getAuthUser ?? getAuthUserById;
  const session = await getSession();
  if (!session?.user) throw new UnauthorizedError();
  const dbUser = await getAuthUser(session.user.id);
  if (!dbUser || dbUser.blockedAt) throw new UnauthorizedError();
  return { id: dbUser.id, role: dbUser.role, isSuperAdmin: dbUser.isSuperAdmin };
}

// Require an authenticated admin; throws Unauthorized or Forbidden.
export async function requireAdmin(deps: GuardDeps = {}): Promise<SessionUser> {
  const user = await requireUser(deps);
  if (user.role !== "admin") throw new ForbiddenError();
  return user;
}

// Require an authenticated super-admin; throws Unauthorized or Forbidden.
export async function requireSuperAdmin(deps: GuardDeps = {}): Promise<SessionUser> {
  const user = await requireUser(deps);
  if (!user.isSuperAdmin) throw new ForbiddenError();
  return user;
}

// Map auth errors to HTTP responses; returns null for non-auth errors.
export function errorToResponse(err: unknown): Response | null {
  if (err instanceof UnauthorizedError) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
