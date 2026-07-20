import { registry } from "../registry";
import { z } from "../zod";
import { ErrorResponse } from "../schemas";

// Mirrors listImages()'s projection (src/lib/images/service.ts): id, filename, status,
// error, createdAt only — unlike FileRow (used by /api/admin/files) this list does NOT
// select the caption column, so it is documented inline rather than reusing FileRow.
const AdminImageRow = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  status: z.enum(["pending", "processing", "ready", "error"]),
  error: z.string().nullable(),
  createdAt: z.string().datetime(),
});

// GET /api/admin/images (src/app/api/admin/images/route.ts + handler.ts: listImagesResponse()).
registry.registerPath({
  method: "get",
  path: "/api/admin/images",
  tags: ["Admin: Images"],
  summary: "List all uploaded images",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "All uploaded images",
      content: { "application/json": { schema: z.object({ images: z.array(AdminImageRow) }) } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// POST /api/admin/images (.../handler.ts: uploadImage()): stores the object, creates the
// row, schedules background ingestion (vision captioning + embedding). Same
// workspaceIds semantics as document upload (resolveUploadWorkspaceIds()). The handler
// also 400s unsupported content types and files over 10 MB, both surfaced as plain 400s.
registry.registerPath({
  method: "post",
  path: "/api/admin/images",
  tags: ["Admin: Images"],
  summary: "Upload an image and schedule captioning + ingestion",
  security: [{ sessionCookie: [] }],
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.string().openapi({ type: "string", format: "binary", description: "The image file (png/jpeg/webp/gif, max 10 MB)" }),
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
          schema: z.object({ imageId: z.string().uuid(), status: z.literal("processing") }),
        },
      },
    },
    400: {
      description: "No file provided, unsupported content type, or file too large (>10 MB)",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// PATCH /api/admin/images/{id} (.../[id]/route.ts + handler.ts: patchImageCaption()) —
// corrected against the handler: the brief's table listed a `GET /api/admin/images/{id}`
// (params only, "200 image meta"), but no such route exists — [id]/route.ts only exports
// PATCH (edit the caption, re-embed in the background) and DELETE. Replaced with the real
// PATCH endpoint.
registry.registerPath({
  method: "patch",
  path: "/api/admin/images/{id}",
  tags: ["Admin: Images"],
  summary: "Edit an image's caption and re-embed it",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: { "application/json": { schema: z.object({ caption: z.string() }) } },
    },
  },
  responses: {
    200: {
      description: "Re-embedding scheduled",
      content: { "application/json": { schema: z.object({ status: z.literal("processing") }) } },
    },
    400: { description: "Invalid JSON or empty caption", content: { "application/json": { schema: ErrorResponse } } },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// DELETE /api/admin/images/{id} (.../[id]/route.ts) — corrected against the handler: it
// returns `new Response(null, { status: 204 })` on success, not the brief table's `200 {ok}`
// (same shape as DELETE /api/admin/documents/{id}).
registry.registerPath({
  method: "delete",
  path: "/api/admin/images/{id}",
  tags: ["Admin: Images"],
  summary: "Delete an image, its vector, and its stored object",
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    204: { description: "Deleted" },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// POST /api/admin/images/{id}/recaption (.../recaption/route.ts + handler.ts:
// recaptionImageResponse()) — corrected against the handler: it returns
// `{ status: "processing" }`, not the brief table's `200 {ok}`.
registry.registerPath({
  method: "post",
  path: "/api/admin/images/{id}/recaption",
  tags: ["Admin: Images"],
  summary: "Re-run the vision model on an already-uploaded image",
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: "Recaptioning scheduled",
      content: { "application/json": { schema: z.object({ status: z.literal("processing") }) } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorResponse } } },
  },
});
