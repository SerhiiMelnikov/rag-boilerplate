import { registry } from "../registry";
import { z } from "../zod";
import { FileRow, ErrorResponse } from "../schemas";

// GET /api/admin/files (src/app/api/admin/files/route.ts + handler.ts: listFiles()) —
// corrected against the handler: it takes no query parameters at all (the brief's
// table listed "query filters"; the client re-sorts/filters the full list itself).
registry.registerPath({
  method: "get",
  path: "/api/admin/files",
  tags: ["Admin: Files"],
  summary: "List all files (documents + images combined) with their workspace assignments",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "All files, newest first",
      content: { "application/json": { schema: z.object({ files: z.array(FileRow) }) } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// PUT /api/admin/files/{kind}/{id}/workspaces (.../[kind]/[id]/workspaces/handler.ts:
// setFileWorkspacesResponse()): replaces the full workspace assignment for one file.
// `kind` is read as a raw path segment and validated inside the handler (400 if it is
// neither "document" nor "image"); documented as an enum for clarity.
registry.registerPath({
  method: "put",
  path: "/api/admin/files/{kind}/{id}/workspaces",
  tags: ["Admin: Files"],
  summary: "Replace a file's workspace assignments",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ kind: z.enum(["document", "image"]), id: z.string().uuid() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({ workspaceIds: z.array(z.string().uuid()) }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Workspaces replaced",
      content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } },
    },
    400: {
      description: "Invalid kind, invalid JSON, malformed body, or an unknown workspace id",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
    404: { description: "File not found", content: { "application/json": { schema: ErrorResponse } } },
  },
});
