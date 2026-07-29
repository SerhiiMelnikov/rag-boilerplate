import type { NextAuthConfig } from "next-auth";
import { applySessionClaims, jwtCallback } from "@/lib/auth/session-callbacks";

// Edge-safe base config (no DB, no bcrypt) — shared by middleware and the full
// node config. Providers are added in src/auth.ts. The callbacks live in
// src/lib/auth/session-callbacks.ts because the api-only build deletes this
// file yet still needs the identical claim shaping.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    jwt: (params) => jwtCallback(params),
    session: (params) => {
      applySessionClaims(params.session, params.token);
      return params.session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
