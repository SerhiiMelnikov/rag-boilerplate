import { after } from "next/server";
import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { deleteImage } from "@/lib/images/service";
import { patchImageCaption } from "@/api/admin/images/[id]/handler";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return patchImageCaption(id, request, { schedule: (fn) => { after(fn); } });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    await requireAdmin();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const { id } = await ctx.params;
  const ok = await deleteImage(id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
