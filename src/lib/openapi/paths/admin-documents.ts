import { registry } from "../registry";
import { z } from "../zod";
import { Document, ErrorResponse } from "../schemas";

// GET /api/admin/documents (src/app/api/admin/documents/route.ts): listDocuments().
registry.registerPath({
  method: "get",
  path: "/api/admin/documents",
  tags: ["Admin: Documents"],
  summary: "List all documents",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "All uploaded documents",
      content: { "application/json": { schema: z.object({ documents: z.array(Document) }) } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// POST /api/admin/documents (src/app/api/admin/documents/handler.ts: uploadDocument()):
// creates the row synchronously, assigns workspaces, and schedules ingestion in the
// background — the response always reports status "processing", never the final
// ready/error outcome. `workspaceIds` may repeat for multiple workspaces; when
// omitted the file defaults to the General workspace (resolveUploadWorkspaceIds()).
registry.registerPath({
  method: "post",
  path: "/api/admin/documents",
  tags: ["Admin: Documents"],
  summary: "Upload a document and schedule it for ingestion",
  security: [{ sessionCookie: [] }],
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.string().openapi({ type: "string", format: "binary", description: "The document file" }),
            workspaceIds: z.array(z.string().uuid()).optional()
              .openapi({ description: "Workspace ids to assign; omitted defaults to the General workspace" }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Ingestion scheduled",
      content: {
        "application/json": {
          schema: z.object({ documentId: z.string().uuid(), status: z.literal("processing") }),
        },
      },
    },
    400: { description: "No file provided", content: { "application/json": { schema: ErrorResponse } } },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// DELETE /api/admin/documents/{id} (src/app/api/admin/documents/[id]/route.ts) — corrected
// against the handler: it returns `new Response(null, { status: 204 })` on success, not
// the brief table's `200 {ok}` (same shape as DELETE /api/conversations/{id}).
registry.registerPath({
  method: "delete",
  path: "/api/admin/documents/{id}",
  tags: ["Admin: Documents"],
  summary: "Delete a document and its vectors",
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    204: { description: "Deleted" },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorResponse } } },
  },
});
