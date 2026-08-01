import { requireUser, errorToResponse } from "@/lib/auth/guards";
import { getConversationWithMessages, deleteConversation, renameConversation } from "@/lib/chat/conversations";
import { renameConversationSchema } from "@/lib/validation";

export interface ConversationItemDeps {
  getUser?: typeof requireUser;
  getConversationWithMessagesFn?: typeof getConversationWithMessages;
  deleteConversationFn?: typeof deleteConversation;
  renameConversationFn?: typeof renameConversation;
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

export async function patchConversationResponse(request: Request, id: string, deps: ConversationItemDeps = {}): Promise<Response> {
  const getUser = deps.getUser ?? requireUser;
  const renameFn = deps.renameConversationFn ?? renameConversation;

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
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = renameConversationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Title must be 1-200 characters" }, { status: 400 });
  }

  const ok = await renameFn(user.id, id, parsed.data.title);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ id, title: parsed.data.title });
}
