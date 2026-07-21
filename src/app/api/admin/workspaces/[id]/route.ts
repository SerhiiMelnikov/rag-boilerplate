import { patchWorkspaceResponse, deleteWorkspaceResponse } from "@/api/admin/workspaces/[id]/handler";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return patchWorkspaceResponse(id, request);
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return deleteWorkspaceResponse(id);
}
