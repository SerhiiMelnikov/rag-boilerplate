// The claim shaping for a browser session, extracted from src/auth.config.ts so
// that the api-only build can reach it: that build deletes src/auth.config.ts
// and src/auth.ts outright, yet still runs @auth/core's Auth() for OAuth (see
// src/server/routes.ts). Both runtimes must mint identically shaped tokens, so
// there is exactly one definition and no `next-auth` import here.
export interface TokenClaims {
  [key: string]: unknown;
}

// Persist id, role, and isSuperAdmin into the JWT.
export function jwtCallback({ token, user }: { token: TokenClaims; user?: unknown }): TokenClaims {
  if (user) {
    token.id = (user as { id: string }).id;
    token.role = (user as { role: "admin" | "user" }).role;
    token.isSuperAdmin = (user as { isSuperAdmin?: boolean }).isSuperAdmin ?? false;
    // When this SESSION began, for the password-change cut-off in requireUser.
    // Deliberately a custom claim, not the registered `iat`: @auth/core
    // re-signs the token on every session read and jose's .setIssuedAt()
    // overwrites `iat` with "now", so `iat` tracks the last refresh, not the
    // sign-in. Stamped only here, inside `if (user)` — Auth.js passes `user`
    // solely on the sign-in path, never on refresh — so it is written once
    // and then carried through every later re-signing untouched.
    token.sessionIssuedAt = Math.floor(Date.now() / 1000);
  }
  return token;
}

// Copies the claims onto the session object in place, rather than returning it.
// A generic "take a session, give one back" signature cannot infer against
// next-auth's Session: it is an interface with no index signature, so TypeScript
// will not accept it as `Record<string, unknown>`, inference falls back to the
// bare constraint, and the returned type silently loses `expires`. Mutating and
// letting the caller return its own object keeps the caller's exact type.
export function applySessionClaims(session: unknown, token: TokenClaims): void {
  const s = session as { user?: Record<string, unknown> } | null | undefined;
  if (!s?.user) return;
  s.user.id = token.id as string;
  s.user.role = token.role as "admin" | "user";
  s.user.isSuperAdmin = (token.isSuperAdmin as boolean) ?? false;
}
