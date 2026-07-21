import { after } from "next/server";
import { patchImageCaption, deleteImageResponse } from "@/api/admin/images/[id]/handler";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return patchImageCaption(id, request, { schedule: (fn) => { after(fn); } });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return deleteImageResponse(request, id);
}
