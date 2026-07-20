import { registry } from "../registry";
import { z } from "../zod";

// GET /api/openapi.json (added in a later task): serves buildOpenApiDocument() itself.
// Public, and deliberately not self-described in full — that would be a schema
// describing its own generator's output shape, which buys nothing here.
registry.registerPath({
  method: "get",
  path: "/api/openapi.json",
  tags: ["Health"],
  summary: "This OpenAPI document, as JSON",
  responses: {
    200: {
      description: "The generated OpenAPI 3.0 document",
      content: { "application/json": { schema: z.record(z.string(), z.unknown()) } },
    },
  },
});
