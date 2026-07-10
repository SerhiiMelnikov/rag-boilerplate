import { listWorkspaceUsersResponse, setWorkspaceGrantResponse } from "./handler";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return listWorkspaceUsersResponse(id);
}

export async function PUT(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return setWorkspaceGrantResponse(id, request);
}
