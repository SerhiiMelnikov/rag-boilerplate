import { getConversationResponse, deleteConversationResponse } from "@/api/conversations/[id]/handler";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return getConversationResponse(request, id);
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return deleteConversationResponse(request, id);
}
