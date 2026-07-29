import NextAuth, { type NextAuthConfig } from "next-auth";
import { authConfig } from "./auth.config";
import { authorizeCredentials } from "@/lib/auth/credentials";
import { oauthConfig } from "@/lib/auth/oauth/config";

// Re-exported for backward compatibility: authorizeCredentials lives in
// src/lib/auth/credentials.ts (next-free) so the api-only build — which prunes
// this file — can still use it for POST /api/auth/login.
export { authorizeCredentials };

// The spread order matters: oauthConfig() supplies providers and ALL FOUR
// callbacks, so it must come second and must be complete. A partial callbacks
// object here would silently delete authConfig's jwt/session — see
// src/lib/auth/oauth/config.ts.
//
// The cast is required, not decorative: oauthConfig() is deliberately next-free
// (api-only serves it through @auth/core's Auth() with no next-auth import
// available), so its providers/callbacks are typed loosely (e.g. `unknown[]`
// for providers) rather than against next-auth's Provider/callback types. Only
// here, where next-auth IS available, do we assert the composed object actually
// satisfies NextAuthConfig.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  ...oauthConfig(),
} as NextAuthConfig);
