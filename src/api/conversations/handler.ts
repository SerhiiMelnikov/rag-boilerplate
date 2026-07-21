import { requireUser, errorToResponse } from "@/lib/auth/guards";
import { listConversations, createConversation } from "@/lib/chat/conversations";
import { parseActiveWorkspaceCookie } from "@/lib/workspaces/cookie";
import { resolveActiveWorkspaceId } from "@/lib/workspaces/access";
import { createWorkspaceRepo, type WorkspaceRepo } from "@/lib/workspaces/repo";

export interface ConversationsDeps {
  getUser?: typeof requireUser;
  listConversationsFn?: typeof listConversations;
  createConversationFn?: typeof createConversation;
  workspaceRepo?: WorkspaceRepo;
}

export async function listConversationsResponse(request: Request, deps: ConversationsDeps = {}): Promise<Response> {
  const getUser = deps.getUser ?? requireUser;
  const listFn = deps.listConversationsFn ?? listConversations;
  const workspaceRepo = deps.workspaceRepo ?? createWorkspaceRepo();

  let user;
  try {
    user = await getUser(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const workspaceId = await resolveActiveWorkspaceId(parseActiveWorkspaceCookie(request), user.id, workspaceRepo);
  return Response.json({ conversations: await listFn(user.id, workspaceId) });
}

export async function createConversationResponse(request: Request, deps: ConversationsDeps = {}): Promise<Response> {
  const getUser = deps.getUser ?? requireUser;
  const createFn = deps.createConversationFn ?? createConversation;
  const workspaceRepo = deps.workspaceRepo ?? createWorkspaceRepo();

  let user;
  try {
    user = await getUser(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const workspaceId = await resolveActiveWorkspaceId(parseActiveWorkspaceCookie(request), user.id, workspaceRepo);
  const conversation = await createFn(user.id, "New conversation", workspaceId);
  return Response.json(conversation, { status: 201 });
}
