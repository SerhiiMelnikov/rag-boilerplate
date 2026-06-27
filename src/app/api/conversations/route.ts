import { requireUser, errorToResponse } from "@/lib/auth/guards";
import { listConversations, createConversation } from "@/lib/chat/conversations";

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  return Response.json({ conversations: await listConversations(user.id) });
}

export async function POST() {
  let user;
  try {
    user = await requireUser();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const conversation = await createConversation(user.id, "New conversation");
  return Response.json(conversation, { status: 201 });
}
