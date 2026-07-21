import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { authorizeCredentials } from "@/lib/auth/credentials";

// Re-exported for backward compatibility: authorizeCredentials now lives in
// src/lib/auth/credentials.ts (next-free) so the api-only build — which prunes
// this file — can still use it for POST /api/auth/login.
export { authorizeCredentials };

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: (creds) => authorizeCredentials(creds ?? {}),
    }),
  ],
});
