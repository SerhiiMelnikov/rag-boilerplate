import { getRunResponse } from "@/api/admin/evaluation/runs/handler";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return getRunResponse(id, request);
}
