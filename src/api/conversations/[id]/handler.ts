import { requireUser, errorToResponse } from "@/lib/auth/guards";
import { getConversationWithMessages, deleteConversation } from "@/lib/chat/conversations";

export interface ConversationItemDeps {
  getUser?: typeof requireUser;
  getConversationWithMessagesFn?: typeof getConversationWithMessages;
  deleteConversationFn?: typeof deleteConversation;
}

export async function getConversationResponse(request: Request, id: string, deps: ConversationItemDeps = {}): Promise<Response> {
  const getUser = deps.getUser ?? requireUser;
  const getFn = deps.getConversationWithMessagesFn ?? getConversationWithMessages;

  let user;
  try {
    user = await getUser(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const conversation = await getFn(user.id, id);
  if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(conversation);
}

export async function deleteConversationResponse(request: Request, id: string, deps: ConversationItemDeps = {}): Promise<Response> {
  const getUser = deps.getUser ?? requireUser;
  const deleteFn = deps.deleteConversationFn ?? deleteConversation;

  let user;
  try {
    user = await getUser(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const ok = await deleteFn(user.id, id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
