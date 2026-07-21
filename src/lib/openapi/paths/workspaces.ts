import { registry } from "../registry";
import { z } from "../zod";
import { Workspace, ErrorResponse } from "../schemas";

// GET /api/workspaces (src/app/api/workspaces/handler.ts): the caller's own visible
// workspaces only. The admin listing lives at /api/admin/workspaces (Task 3).
registry.registerPath({
  method: "get",
  path: "/api/workspaces",
  tags: ["Workspaces"],
  summary: "List the signed-in user's visible workspaces",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Workspaces the caller can see",
      content: { "application/json": { schema: z.object({ workspaces: z.array(Workspace) }) } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
  },
});
