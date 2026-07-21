import { registry } from "../registry";
import { z } from "../zod";
import { ErrorResponse } from "../schemas";

// POST /api/chat (src/app/api/chat/handler.ts): requires an explicit conversationId
// (created up front via POST /api/conversations) and streams the assistant's reply
// via the Vercel AI SDK data-stream protocol — never a single JSON body. The 200
// entry below has no JSON schema by design; `schema: {}` is an empty (unconstrained)
// OpenAPI Schema Object, needed because ZodMediaTypeObject.schema is required by the
// zod-to-openapi types even when there is nothing to constrain.
registry.registerPath({
  method: "post",
  path: "/api/chat",
  tags: ["Chat"],
  summary: "Send a chat message and stream the assistant's reply",
  security: [{ sessionCookie: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
            conversationId: z.string().uuid(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Streamed assistant reply (Vercel AI SDK data-stream protocol)",
      content: { "text/event-stream": { schema: {} } },
    },
    400: {
      description: "Invalid JSON, missing conversationId, or empty message content",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    404: {
      description: "Conversation not found or not owned by the caller",
      content: { "application/json": { schema: ErrorResponse } },
    },
    429: {
      description: "Rate limited (per-minute or per-day quota)",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});
