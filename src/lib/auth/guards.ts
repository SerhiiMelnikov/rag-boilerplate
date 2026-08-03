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
  // Carried so a server component can render the signed-in identity from the
  // same DB-backed read that authorises it, instead of a second lookup or a
  // stale JWT claim.
  email: string;
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
  // Retire every session that began before the user's last password change.
  // requireUser already performs this lookup on every request (so a block takes
  // effect immediately), so the check costs no extra query.
  //
  // sessionIssuedAt is a CUSTOM claim, and that is deliberate: the registered
  // `iat` claim was avoided because @auth/core re-signs the session token on
  // every session read (and jose's .setIssuedAt() overwrites `iat` with "now"),
  // which in the full app is reachable by anyone holding the cookie via
  // GET /api/auth/session. Keying on `iat` therefore let a stolen session be
  // laundered into one that post-dates the reset. The custom claim is written
  // once at sign-in and survives re-signing untouched.
  //
  // `>=` against a FLOORED cut-off, not `>`: the claim is whole seconds while
  // sessions_valid_from carries milliseconds, so a reset at 10:00:00.700 and a
  // login at 10:00:00.900 both floor to 10:00:00, strictly less than the raw
  // cut-off. A strict comparison would refuse the legitimate token the user
  // receives immediately after resetting, every time. The residual hole is at
  // most one second wide and requires an attacker to begin a session in the
  // same wall-clock second in which the victim resets.
  if (dbUser.sessionsValidFrom) {
    const cutoffSeconds = Math.floor(dbUser.sessionsValidFrom.getTime() / 1000);
    if (session.sessionIssuedAt === null || session.sessionIssuedAt < cutoffSeconds) throw new UnauthorizedError();
  }
  return { id: dbUser.id, email: dbUser.email, role: dbUser.role, isSuperAdmin: dbUser.isSuperAdmin };
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
