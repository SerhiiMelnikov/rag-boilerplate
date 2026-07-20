import { registry } from "../registry";
import { z } from "../zod";
import { ErrorResponse } from "../schemas";

// POST /api/messages/{id}/rating (src/app/api/messages/[id]/rating/route.ts) —
// corrected against the handler: the route only exports POST, not PATCH as the
// brief's table listed (resource-oriented name, verb-mismatched implementation).
registry.registerPath({
  method: "post",
  path: "/api/messages/{id}/rating",
  tags: ["Messages"],
  summary: "Rate a message (thumbs up/down) or clear its rating",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({ rating: z.union([z.literal(1), z.literal(-1), z.null()]) }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Rating applied",
      content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } },
    },
    400: {
      description: "Invalid JSON or invalid rating value",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    404: {
      description: "Message not found or not owned by the caller",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});
