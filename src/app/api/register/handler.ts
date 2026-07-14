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

// The caller's IP, from the first hop of x-forwarded-for, or null when the header
// is absent.
//
// A client can forge this header when the app is exposed directly to the internet;
// only a proxy that OVERWRITES it (Vercel, Fly, a correctly configured nginx) makes
// it trustworthy. So this limit raises the cost of mass registration — it does not
// make it impossible. Closing that properly means invitations or email verification,
// which is a separate design.
//
// When the header is absent there is no client identity at all, so we do NOT rate
// limit rather than lump every caller into one shared bucket: that would let five
// anonymous requests lock registration for everyone for an hour, and it would break
// local development, where there is no proxy. An attacker who can reach the origin
// directly could forge the header anyway, so failing open here concedes nothing that
// was not already conceded.
function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

// Testable core: every collaborator is injectable.
// Exported from handler.ts (not route.ts) so Next.js does not reject it as an invalid route export.
export async function registerUser(request: Request, deps: RegisterDeps = {}): Promise<Response> {
  const createUserFn = deps.createUserFn ?? createUser;
  const getLimitsFn = deps.getLimitsFn ?? getRateLimitSettings;
  const rateLimitFn = deps.rateLimitFn ?? consume;

  // Throttle before parsing or touching the users table — but only when there is a
  // client identity to key the bucket on. No x-forwarded-for means no rate limiting
  // (see clientIp's comment for why that's the safer default, not a gap).
  const ip = clientIp(request);
  if (ip !== null) {
    const { registerRateLimitPerHour } = await getLimitsFn();
    const verdict = await rateLimitFn(`register:ip:${ip}`, registerRateLimitPerHour, HOUR_MS);
    if (!verdict.allowed) {
      return Response.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
      );
    }
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
