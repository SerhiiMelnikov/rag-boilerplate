import { getConversationResponse, deleteConversationResponse, patchConversationResponse } from "@/api/conversations/[id]/handler";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return getConversationResponse(request, id);
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return deleteConversationResponse(request, id);
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return patchConversationResponse(request, id);
}
