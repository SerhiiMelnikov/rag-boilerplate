import { registry } from "../registry";
import { z } from "../zod";
import { Conversation, Message, ErrorResponse } from "../schemas";

// GET /api/conversations (src/app/api/conversations/route.ts).
registry.registerPath({
  method: "get",
  path: "/api/conversations",
  tags: ["Conversations"],
  summary: "List the signed-in user's conversations in the active workspace",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "The user's conversations, newest first",
      content: { "application/json": { schema: z.object({ conversations: z.array(Conversation) }) } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// POST /api/conversations (src/app/api/conversations/route.ts): createConversation()
// returns only the new row's id ({ id }), not a full Conversation.
registry.registerPath({
  method: "post",
  path: "/api/conversations",
  tags: ["Conversations"],
  summary: "Create a new conversation in the active workspace",
  security: [{ sessionCookie: [] }],
  responses: {
    201: {
      description: "The new conversation's id",
      content: { "application/json": { schema: z.object({ id: z.string().uuid() }) } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// GET /api/conversations/{id} (src/app/api/conversations/[id]/route.ts):
// getConversationWithMessages() returns { id, title, messages }, NOT the Conversation
// ref — that ref is the list projection ({id,title,createdAt}) from listConversations().
// Written inline per the Task 1 review note.
registry.registerPath({
  method: "get",
  path: "/api/conversations/{id}",
  tags: ["Conversations"],
  summary: "Get a conversation with its messages",
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: "The conversation and its messages",
      content: {
        "application/json": {
          schema: z.object({ id: z.string().uuid(), title: z.string(), messages: z.array(Message) }),
        },
      },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    404: {
      description: "Not found or not owned by the caller",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// DELETE /api/conversations/{id} (src/app/api/conversations/[id]/route.ts) — corrected
// against the handler: it returns `new Response(null, { status: 204 })` on success, not
// the brief table's `200 {ok}`.
registry.registerPath({
  method: "delete",
  path: "/api/conversations/{id}",
  tags: ["Conversations"],
  summary: "Delete a conversation",
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    204: { description: "Deleted" },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    404: {
      description: "Not found or not owned by the caller",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});
