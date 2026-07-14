import { credentialsSchema } from "@/lib/validation";
import { createUser, DuplicateEmailError } from "@/lib/auth/users";
import { getRateLimitSettings } from "@/lib/config/settings-service";
import { consume } from "@/lib/ratelimit/store";

const HOUR_MS = 60 * 60 * 1000;

export interface RegisterDeps {
  createUserFn?: typeof createUser;
  getLimitsFn?: typeof getRateLimitSettings;
  rateLimitFn?: typeof consume;
}

// The caller's IP, taken from the first hop of x-forwarded-for.
//
// A client can forge this header when the app is exposed directly to the
// internet — only a proxy that OVERWRITES it (Vercel, Fly, a correctly
// configured nginx) makes it trustworthy. This limit therefore raises the cost
// of mass registration; it does not make it impossible. Closing that properly
// means invitations or email verification, which is a separate design.
function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

// Testable core: every collaborator is injectable.
// Exported from handler.ts (not route.ts) so Next.js does not reject it as an invalid route export.
export async function registerUser(request: Request, deps: RegisterDeps = {}): Promise<Response> {
  const createUserFn = deps.createUserFn ?? createUser;
  const getLimitsFn = deps.getLimitsFn ?? getRateLimitSettings;
  const rateLimitFn = deps.rateLimitFn ?? consume;

  // Throttle before parsing or touching the users table.
  const { registerRateLimitPerHour } = await getLimitsFn();
  const verdict = await rateLimitFn(`register:ip:${clientIp(request)}`, registerRateLimitPerHour, HOUR_MS);
  if (!verdict.allowed) {
    return Response.json(
      { error: "Too many registration attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    // Self-registration always creates a regular user; admins are seeded.
    const user = await createUserFn({ email: parsed.data.email, password: parsed.data.password, role: "user" });
    return Response.json(user, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      return Response.json({ error: "Email already registered" }, { status: 409 });
    }
    throw err;
  }
}
