import { patchUserResponse } from "@/api/admin/users/[id]/handler";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return patchUserResponse(id, request);
}
