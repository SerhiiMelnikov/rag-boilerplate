import { z } from "zod";
import { requireSuperAdmin, errorToResponse } from "@/lib/auth/guards";
import { setUserRole, setUserBlocked, SuperAdminProtectedError, SelfActionError, UserNotFoundError } from "@/lib/auth/user-admin";

// Exactly one of role | blocked.
const patchSchema = z.union([
  z.object({ role: z.enum(["admin", "user"]) }).strict(),
  z.object({ blocked: z.boolean() }).strict(),
]);

export interface UserItemDeps {
  getSuperAdmin?: typeof requireSuperAdmin;
  setUserRoleFn?: typeof setUserRole;
  setUserBlockedFn?: typeof setUserBlocked;
}

export async function patchUserResponse(id: string, request: Request, deps: UserItemDeps = {}): Promise<Response> {
  const getSuperAdmin = deps.getSuperAdmin ?? requireSuperAdmin;
  const setUserRoleFn = deps.setUserRoleFn ?? setUserRole;
  const setUserBlockedFn = deps.setUserBlockedFn ?? setUserBlocked;

  let actor;
  try {
    actor = await getSuperAdmin();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "role or blocked is required" }, { status: 400 });

  try {
    if ("role" in parsed.data) await setUserRoleFn(id, parsed.data.role, actor.id, undefined);
    else await setUserBlockedFn(id, parsed.data.blocked, actor.id, undefined);
  } catch (err) {
    if (err instanceof SuperAdminProtectedError || err instanceof SelfActionError) return Response.json({ error: (err as Error).message }, { status: 403 });
    if (err instanceof UserNotFoundError) return Response.json({ error: "Not found" }, { status: 404 });
    throw err;
  }
  return Response.json({ ok: true });
}
