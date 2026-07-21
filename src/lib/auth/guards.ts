import { getSessionFromRequest } from "@/lib/auth/session";
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

// getSession reads the request itself (Bearer header or cookie — see
// getSessionFromRequest) instead of relying on next-auth's async-context
// auth(), so guards no longer need next-auth in scope.
type GuardDeps = { getSession?: (request: Request) => ReturnType<typeof getSessionFromRequest>; getAuthUser?: typeof getAuthUserById };

// Require an authenticated, existing, non-blocked user. One indexed DB lookup so
// a block/deletion takes effect on the next request, not just at next login.
export async function requireUser(request: Request, deps: GuardDeps = {}): Promise<SessionUser> {
  const getAuthUser = deps.getAuthUser ?? getAuthUserById;
  const session = await (deps.getSession?.(request) ?? getSessionFromRequest(request));
  if (!session) throw new UnauthorizedError();
  const dbUser = await getAuthUser(session.id);
  if (!dbUser || dbUser.blockedAt) throw new UnauthorizedError();
  return { id: dbUser.id, role: dbUser.role, isSuperAdmin: dbUser.isSuperAdmin };
}

// Require an authenticated admin; throws Unauthorized or Forbidden.
export async function requireAdmin(request: Request, deps: GuardDeps = {}): Promise<SessionUser> {
  const user = await requireUser(request, deps);
  if (user.role !== "admin") throw new ForbiddenError();
  return user;
}

// Require an authenticated super-admin; throws Unauthorized or Forbidden.
export async function requireSuperAdmin(request: Request, deps: GuardDeps = {}): Promise<SessionUser> {
  const user = await requireUser(request, deps);
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
