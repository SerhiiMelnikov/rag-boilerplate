import { z } from "zod";
import { requireUser, errorToResponse } from "@/lib/auth/guards";
import { setRating } from "@/lib/chat/conversations";

const ratingSchema = z.object({ rating: z.union([z.literal(1), z.literal(-1), z.null()]) });

export interface RatingDeps {
  getUser?: typeof requireUser;
  setRatingFn?: typeof setRating;
}

export async function rateMessageResponse(id: string, request: Request, deps: RatingDeps = {}): Promise<Response> {
  const getUser = deps.getUser ?? requireUser;
  const setRatingFn = deps.setRatingFn ?? setRating;

  let user;
  try {
    user = await getUser(request);
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
  const ok = await setRatingFn(user.id, id, parsed.data.rating);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
