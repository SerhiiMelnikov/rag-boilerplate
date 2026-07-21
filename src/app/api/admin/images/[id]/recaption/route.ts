import { recaptionImageResponse } from "@/api/admin/images/[id]/recaption/handler";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return recaptionImageResponse(id);
}
