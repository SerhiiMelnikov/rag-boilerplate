import { encode, decode } from "@auth/core/jwt";

export interface SessionUser {
  id: string;
  role: string;
  isSuperAdmin: boolean;
}

// NextAuth v5 (Auth.js) encrypts the session JWT (JWE) using AUTH_SECRET and a
// salt equal to the cookie name. We read/write with the SAME (secret, salt) so
// a token minted here and a token minted by NextAuth's own cookie are mutually
// decodable. See auth.config.ts's jwt/session callbacks for the claim shape
// this mirrors (id, role, isSuperAdmin, sub).
const COOKIE_NAME = "authjs.session-token";
const SECURE_COOKIE_NAME = "__Secure-authjs.session-token";

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is required.");
  return s;
}

// Extract the raw JWT string: Authorization: Bearer wins; else either cookie
// name (secure-prefixed cookie is what NextAuth sets under https/production).
// The salt used to encrypt a given token is not knowable from its transport
// (a __Secure-salted token can be forwarded via Bearer, e.g. by a non-browser
// client that copied it from a production cookie), so we only extract the raw
// token here and let the caller try every candidate salt.
function extractToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const cookie = request.headers.get("cookie") ?? "";
  for (const salt of [SECURE_COOKIE_NAME, COOKIE_NAME]) {
    const m = new RegExp(`(?:^|; )${salt.replace(/[.$]/g, "\\$&")}=([^;]+)`).exec(cookie);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

// Mint a session JWT with the exact claim shape auth.config.ts's jwt callback
// produces, so a token minted here satisfies the same downstream reads
// (guards.ts / auth.config.ts's session callback) as one NextAuth issues.
export async function encodeSessionToken(user: SessionUser): Promise<string> {
  return encode({
    token: { sub: user.id, id: user.id, role: user.role, isSuperAdmin: user.isSuperAdmin },
    secret: secret(),
    salt: COOKIE_NAME,
  });
}

export async function getSessionFromRequest(request: Request): Promise<SessionUser | null> {
  const token = extractToken(request);
  if (!token) return null;
  const s = secret();
  // Try every salt NextAuth might have encrypted this token with, regardless
  // of which transport (Bearer or cookie) it arrived on: a production
  // __Secure-salted token forwarded via Authorization: Bearer must still
  // decode, not just a dev-salted one.
  for (const salt of [SECURE_COOKIE_NAME, COOKIE_NAME]) {
    try {
      const payload = await decode({ token, secret: s, salt });
      if (!payload?.sub && !payload?.id) continue;
      const id = String(payload.id ?? payload.sub);
      return { id, role: String(payload.role ?? "user"), isSuperAdmin: Boolean(payload.isSuperAdmin) };
    } catch {
      // Wrong salt (or malformed token) for this candidate; try the next one.
    }
  }
  return null;
}
