import { z } from "zod";
import { requireUser, errorToResponse } from "@/lib/auth/guards";
import { setRating } from "@/lib/chat/conversations";

const ratingSchema = z.object({ rating: z.union([z.literal(1), z.literal(-1), z.null()]) });
type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  let user;
  try {
    user = await requireUser();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = ratingSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid rating" }, { status: 400 });
  const { id } = await ctx.params;
  const ok = await setRating(user.id, id, parsed.data.rating);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
