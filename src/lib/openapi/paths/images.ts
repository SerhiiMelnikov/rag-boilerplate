import { registry } from "../registry";
import { z } from "../zod";
import { ErrorResponse } from "../schemas";

// GET /api/images/{id} (src/app/api/images/[id]/handler.ts): serves the raw image
// bytes with the stored Content-Type. `schema: {}` is an empty (unconstrained) OpenAPI
// Schema Object — needed because ZodMediaTypeObject.schema is required by the
// zod-to-openapi types even for a binary body with no JSON schema.
registry.registerPath({
  method: "get",
  path: "/api/images/{id}",
  tags: ["Images"],
  summary: "Serve an admin-uploaded image's raw bytes",
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: "The image bytes", content: { "image/*": { schema: {} } } },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorResponse } } },
  },
});
