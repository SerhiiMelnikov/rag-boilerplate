import { registry } from "../registry";
import { z } from "../zod";
import { ErrorResponse } from "../schemas";

// POST /api/admin/documents/url (src/app/api/admin/documents/url/route.ts +
// src/api/admin/documents/url/handler.ts: ingestUrlResponse()): fetches the URL,
// extracts its readable article text (Readability, src/lib/rag/extract-url.ts),
// creates the document with filename = the URL (documents.filename is unique, so
// re-posting the same URL updates that document instead of creating a duplicate),
// assigns it to the General workspace, and schedules chunking/embedding/storage in
// the background — the response always reports status "processing", never the
// final ready/error outcome (poll GET /api/admin/documents for that, as with upload).
registry.registerPath({
  method: "post",
  path: "/api/admin/documents/url",
  tags: ["Admin: Documents"],
  summary: "Ingest a document from a URL",
  security: [{ sessionCookie: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ url: z.string().openapi({ description: "The http(s) page to fetch and ingest" }) }),
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
    400: {
      description:
        "Missing url, or the URL could not be fetched/extracted (malformed syntax, unsupported scheme, non-HTML content-type, oversized response, or a network failure)",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
  },
});
