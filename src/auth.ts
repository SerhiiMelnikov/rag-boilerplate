import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { getUserByEmail } from "@/lib/auth/users";
import { verifyPassword } from "@/lib/auth/password";

// Narrow injectable types so unit-test mocks (vi.fn) can satisfy them without
// requiring the full DB-aware signature of getUserByEmail / verifyPassword.
// role is typed as string (not the union) so that vi.fn returning literal "user"
// (inferred as string) satisfies the type without needing an explicit cast in tests.
type LookupFn = (email: string) => Promise<{
  id: string;
  email: string;
  role: string;
  passwordHash: string;
  blockedAt: Date | null;
  isSuperAdmin: boolean;
} | null>;
type VerifyFn = (plain: string, hash: string) => Promise<boolean>;

// Verify credentials against the DB. Exported for unit testing and reuse.
export async function authorizeCredentials(
  creds: { email?: unknown; password?: unknown },
  deps: { lookup?: LookupFn; verify?: VerifyFn } = {},
): Promise<{ id: string; email: string; role: "admin" | "user"; isSuperAdmin: boolean } | null> {
  const lookup: LookupFn = deps.lookup ?? getUserByEmail;
  const verify: VerifyFn = deps.verify ?? verifyPassword;
  const email = typeof creds.email === "string" ? creds.email : "";
  const password = typeof creds.password === "string" ? creds.password : "";
  if (!email || !password) return null;
  const user = await lookup(email);
  if (!user) return null;
  if (user.blockedAt) return null; // blocked → cannot authenticate
  if (!(await verify(password, user.passwordHash))) return null;
  return { id: user.id, email: user.email, role: user.role as "admin" | "user", isSuperAdmin: user.isSuperAdmin };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: (creds) => authorizeCredentials(creds ?? {}),
    }),
  ],
});
