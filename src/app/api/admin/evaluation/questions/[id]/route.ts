import { updateQuestionResponse, deleteQuestionResponse } from "../handler";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return updateQuestionResponse(id, request);
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return deleteQuestionResponse(id);
}
