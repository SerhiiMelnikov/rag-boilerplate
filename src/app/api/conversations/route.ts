import { requireUser, errorToResponse } from "@/lib/auth/guards";
import { listConversations, createConversation } from "@/lib/chat/conversations";
import { parseActiveWorkspaceCookie } from "@/lib/workspaces/cookie";
import { resolveActiveWorkspaceId } from "@/lib/workspaces/access";
import { createWorkspaceRepo } from "@/lib/workspaces/repo";

export async function GET(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const repo = createWorkspaceRepo();
  const workspaceId = await resolveActiveWorkspaceId(parseActiveWorkspaceCookie(request), user.id, repo);
  return Response.json({ conversations: await listConversations(user.id, workspaceId) });
}

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const repo = createWorkspaceRepo();
  const workspaceId = await resolveActiveWorkspaceId(parseActiveWorkspaceCookie(request), user.id, repo);
  const conversation = await createConversation(user.id, "New conversation", workspaceId);
  return Response.json(conversation, { status: 201 });
}
