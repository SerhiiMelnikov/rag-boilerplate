import { listWorkspaceUsersResponse, setWorkspaceGrantResponse } from "@/api/admin/workspaces/[id]/users/handler";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return listWorkspaceUsersResponse(id, request);
}

export async function PUT(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return setWorkspaceGrantResponse(id, request);
}
