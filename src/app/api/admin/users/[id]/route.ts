import { z } from "zod";
import { requireSuperAdmin, errorToResponse } from "@/lib/auth/guards";
import { setUserRole, setUserBlocked, SuperAdminProtectedError, SelfActionError, UserNotFoundError } from "@/lib/auth/user-admin";

type Ctx = { params: Promise<{ id: string }> };
// Exactly one of role | blocked.
const patchSchema = z.union([
  z.object({ role: z.enum(["admin", "user"]) }).strict(),
  z.object({ blocked: z.boolean() }).strict(),
]);

export async function PATCH(request: Request, ctx: Ctx) {
  let actor;
  try {
    actor = await requireSuperAdmin();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "role or blocked is required" }, { status: 400 });

  try {
    if ("role" in parsed.data) await setUserRole(id, parsed.data.role, actor.id, undefined);
    else await setUserBlocked(id, parsed.data.blocked, actor.id, undefined);
  } catch (err) {
    if (err instanceof SuperAdminProtectedError || err instanceof SelfActionError) return Response.json({ error: (err as Error).message }, { status: 403 });
    if (err instanceof UserNotFoundError) return Response.json({ error: "Not found" }, { status: 404 });
    throw err;
  }
  return Response.json({ ok: true });
}
