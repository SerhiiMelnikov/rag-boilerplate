import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: "admin" | "user"; isSuperAdmin: boolean } & DefaultSession["user"];
  }
  interface User {
    role: "admin" | "user";
    isSuperAdmin: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "admin" | "user";
    isSuperAdmin: boolean;
    // Seconds. When the SESSION began — see the jwt callback in auth.config.ts
    // for why this is not the registered `iat` claim.
    sessionIssuedAt: number;
  }
}
