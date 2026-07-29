import { newPasswordSchema } from "@/lib/validation";
import { requireUser, errorToResponse } from "@/lib/auth/guards";
import { getUserWithHashById } from "@/lib/auth/users";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { setPasswordAndInvalidateSessions } from "@/lib/auth/password-reset";
import { encodeSessionToken } from "@/lib/auth/session";

export interface ChangePasswordDeps {
  requireUserFn?: typeof requireUser;
  lookupFn?: typeof getUserWithHashById;
  verifyFn?: typeof verifyPassword;
  hashPasswordFn?: typeof hashPassword;
  setPasswordFn?: typeof setPasswordAndInvalidateSessions;
  encodeTokenFn?: typeof encodeSessionToken;
}

// Changing your password ends every session, including the caller's own — that
// is the point of sessions_valid_from. An api-only client holds a bearer token
// and would be logged out by its own successful request, so it gets a fresh one
// back, mirroring POST /api/auth/login.
//
// Deliberately does NOT set a cookie. Re-issuing Auth.js's session cookie by hand
// means reproducing its name, __Secure- prefix, httpOnly, sameSite, path and
// maxAge exactly — six attributes tracking a library we do not control, with
// nothing to catch the drift. The full-app UI instead calls signOut() after a
// 200 and sends the user to /login?passwordChanged=1.
export async function changePassword(request: Request, deps: ChangePasswordDeps = {}): Promise<Response> {
  const requireUserFn = deps.requireUserFn ?? requireUser;
  const lookupFn = deps.lookupFn ?? getUserWithHashById;
  const verifyFn = deps.verifyFn ?? verifyPassword;
  const hashPasswordFn = deps.hashPasswordFn ?? hashPassword;
  const setPasswordFn = deps.setPasswordFn ?? setPasswordAndInvalidateSessions;
  const encodeTokenFn = deps.encodeTokenFn ?? encodeSessionToken;

  let session: Awaited<ReturnType<typeof requireUser>>;
  try {
    session = await requireUserFn(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = newPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const user = await lookupFn(session.id);
  // requireUser already proved this row existed a moment ago; if it is gone now
  // the session is stale, which is a 401, not a 500.
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Re-proving the current password is what stops the holder of a stolen token
  // from locking the real owner out of their own account.
  if (!(await verifyFn(parsed.data.currentPassword, user.passwordHash))) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const passwordHash = await hashPasswordFn(parsed.data.newPassword);
  await setPasswordFn(session.id, passwordHash);

  // Minted AFTER the cut-off is written, or the token we hand back would be one
  // of the ones we just retired.
  const token = await encodeTokenFn({ id: session.id, role: session.role, isSuperAdmin: session.isSuperAdmin });
  return Response.json({ token });
}
