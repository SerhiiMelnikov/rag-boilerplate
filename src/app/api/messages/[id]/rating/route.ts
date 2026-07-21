import { rateMessageResponse } from "@/api/messages/[id]/rating/handler";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return rateMessageResponse(id, request);
}
