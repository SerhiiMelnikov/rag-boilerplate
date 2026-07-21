import { serveImage } from "@/api/images/[id]/handler";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return serveImage(id);
}
