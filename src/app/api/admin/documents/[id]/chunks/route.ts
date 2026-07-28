import { getDocumentChunksResponse } from "@/api/admin/documents/[id]/chunks/handler";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return getDocumentChunksResponse(id, request);
}
