import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import { authConfig } from "./auth.config";
import { authorizeCredentials } from "@/lib/auth/credentials";
import { oauthConfig } from "@/lib/auth/oauth/config";

// Re-exported for backward compatibility: authorizeCredentials lives in
// src/lib/auth/credentials.ts (next-free) so the api-only build — which prunes
// this file — can still use it for POST /api/auth/login.
export { authorizeCredentials };

// providers is the ONLY field that needs a cast: oauthConfig() deliberately
// types it `unknown[]` so the next-free module (also used from the api-only
// build) never has to name Auth.js's internal Provider union. Everything else
// — pages, session, and critically callbacks — is left to `satisfies
// NextAuthConfig` below, which keeps it structurally checked against next-auth's
// real types. A blanket `as NextAuthConfig` on the whole object would silence
// that check entirely: a typo'd key or a wrong callback signature introduced
// later in either authConfig or oauthConfig() would then compile in silence.
const { providers, ...rest } = oauthConfig();

// The spread order matters: oauthConfig() supplies providers and ALL FOUR
// callbacks, so it must come second and must be complete. A partial callbacks
// object here would silently delete authConfig's jwt/session — see
// src/lib/auth/oauth/config.ts. (`satisfies` cannot itself enforce "all four
// callbacks present": NextAuthConfig["callbacks"] declares every callback
// optional, so a missing one still type-checks — only src/auth.test.ts's
// runtime assertion catches that.)
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  ...rest,
  providers: providers as Provider[],
} satisfies NextAuthConfig);
