import { requireUser, errorToResponse } from "@/lib/auth/guards";
import { getConversationWithMessages, deleteConversation } from "@/lib/chat/conversations";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  let user;
  try {
    user = await requireUser();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const { id } = await ctx.params;
  const conversation = await getConversationWithMessages(user.id, id);
  if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(conversation);
}

export async function DELETE(_request: Request, ctx: Ctx) {
  let user;
  try {
    user = await requireUser();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const { id } = await ctx.params;
  const ok = await deleteConversation(user.id, id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
