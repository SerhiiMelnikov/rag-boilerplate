import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { deleteDocument } from "@/lib/documents/service";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    await requireAdmin();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const { id } = await ctx.params;
  const ok = await deleteDocument(id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
