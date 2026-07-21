import { after } from "next/server";
import { recaptionImageResponse } from "@/api/admin/images/[id]/recaption/handler";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return recaptionImageResponse(id, request, { schedule: (fn) => { after(fn); } });
}
