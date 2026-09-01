import { registry } from "../registry";
import { z } from "../zod";
import { ErrorResponse } from "../schemas";

const Plan = z.object({
  add: z.array(z.string()), update: z.array(z.string()), delete: z.array(z.string()),
  dirs: z.array(z.string()), errors: z.array(z.string()),
});

registry.registerPath({
  method: "post", path: "/api/admin/documents/sync/preview", tags: ["Admin: Documents"],
  summary: "Preview a documents-directory reconcile", security: [{ sessionCookie: [] }],
  responses: {
    200: { description: "The reconcile plan", content: { "application/json": { schema: Plan } } },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
    409: { description: "No documents directories configured or a directory is unreadable", content: { "application/json": { schema: ErrorResponse } } },
  },
});

registry.registerPath({
  method: "post", path: "/api/admin/documents/sync/apply", tags: ["Admin: Documents"],
  summary: "Apply a confirmed documents-directory reconcile", security: [{ sessionCookie: [] }],
  request: { body: { content: { "application/json": { schema: z.object({
    add: z.array(z.string()), update: z.array(z.string()), delete: z.array(z.string()),
  }) } } } },
  responses: {
    200: { description: "Counts applied", content: { "application/json": { schema: z.object({ added: z.number(), updated: z.number(), deleted: z.number() }) } } },
    400: { description: "Malformed body", content: { "application/json": { schema: ErrorResponse } } },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
  },
});
