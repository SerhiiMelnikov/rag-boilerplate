import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Coarse pre-filter: requires a session for the matched routes. Fine-grained
// role checks happen per-route via requireAdmin. The full auth (with the DB
// Credentials provider) runs in route handlers, not here (edge-safe config).
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Protect app pages and non-auth APIs; let NextAuth's own routes through.
  matcher: ["/admin/:path*", "/api/chat/:path*", "/api/conversations/:path*", "/api/admin/:path*"],
};
