import { setFileWorkspacesResponse } from "./handler";

type Ctx = { params: Promise<{ kind: string; id: string }> };

export async function PUT(request: Request, ctx: Ctx) {
  const { kind, id } = await ctx.params;
  return setFileWorkspacesResponse(kind, id, request);
}
