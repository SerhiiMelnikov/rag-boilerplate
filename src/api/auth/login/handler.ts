import { encodeSessionToken } from "@/lib/auth/session";
import { authorizeCredentials } from "@/lib/auth/credentials";

type Authorize = (email: string, password: string) => Promise<{ id: string; role: string; isSuperAdmin: boolean } | null>;

export interface LoginDeps {
  authorize?: Authorize;
}

// api-only login: exchanges email/password for a bearer session token, minted
// with the same claim shape (and secret/salt) getSessionFromRequest decodes —
// see src/lib/auth/session.ts. Uses authorizeCredentials from
// @/lib/auth/credentials (next-free), not @/auth, so the api-only build (which
// prunes src/auth.ts) can still serve this endpoint.
export async function loginResponse(request: Request, deps: LoginDeps = {}): Promise<Response> {
  const authorize = deps.authorize ?? ((email, password) => authorizeCredentials({ email, password }));

  let parsed: { email?: unknown; password?: unknown };
  try {
    parsed = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof parsed.email === "string" ? parsed.email : "";
  const password = typeof parsed.password === "string" ? parsed.password : "";
  if (!email || !password) return Response.json({ error: "email and password are required" }, { status: 400 });

  const user = await authorize(email, password);
  if (!user) return Response.json({ error: "Invalid credentials" }, { status: 401 });

  return Response.json({ token: await encodeSessionToken(user) });
}
