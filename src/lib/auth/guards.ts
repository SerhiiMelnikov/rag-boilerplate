import { auth } from "@/auth";

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

interface SessionUser {
  id: string;
  role: "admin" | "user";
}

// Require an authenticated session; returns the session user or throws.
export async function requireUser(deps: { getSession?: typeof auth } = {}): Promise<SessionUser> {
  const getSession = deps.getSession ?? auth;
  const session = await getSession();
  if (!session?.user) throw new UnauthorizedError();
  return { id: session.user.id, role: session.user.role };
}

// Require an authenticated admin; throws Unauthorized or Forbidden.
export async function requireAdmin(deps: { getSession?: typeof auth } = {}): Promise<SessionUser> {
  const user = await requireUser(deps);
  if (user.role !== "admin") throw new ForbiddenError();
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
