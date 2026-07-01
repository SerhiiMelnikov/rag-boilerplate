import type { NextAuthConfig } from "next-auth";

// Edge-safe base config (no DB, no bcrypt) — shared by middleware and the full
// node config. Providers are added in src/auth.ts.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    // Persist id, role, and isSuperAdmin into the JWT, then expose them on the session.
    jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: "admin" | "user" }).role;
        token.isSuperAdmin = (user as { isSuperAdmin?: boolean }).isSuperAdmin ?? false;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "admin" | "user";
        session.user.isSuperAdmin = (token.isSuperAdmin as boolean) ?? false;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
