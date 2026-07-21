import { deleteDocumentResponse } from "@/api/admin/documents/[id]/handler";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return deleteDocumentResponse(id);
}
