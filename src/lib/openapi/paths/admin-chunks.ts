import { registry } from "../registry";
import { z } from "../zod";
import { ErrorResponse } from "../schemas";

// Mirrors ChunkRow (src/lib/vectorstore/types.ts). chunkIndex is null for chunks
// ingested before position tracking existed — a real, expected value the admin chunk
// preview must be able to tell apart from position 0, not an error to mask.
const AdminChunkRow = z.object({
  chunkIndex: z.number().int().nullable(),
  content: z.string(),
  contentHash: z.string(),
});

// GET /api/admin/documents/{id}/chunks (.../[id]/chunks/route.ts + handler.ts:
// getDocumentChunksResponse()) — paged chunk listing backing the admin ingestion
// inspection preview (VectorStore.listChunks, Task 2). `limit` defaults to 50 and is
// clamped to 100 (absent/non-numeric/non-positive values also fall back to the
// default); `offset` defaults to 0 and a negative value is rejected with 400 rather
// than passed through to the store.
registry.registerPath({
  method: "get",
  path: "/api/admin/documents/{id}/chunks",
  tags: ["Admin: Documents"],
  summary: "List a document's chunks, in order, for the ingestion inspection preview",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    query: z.object({
      limit: z.string().optional().openapi({
        description: "Page size (default 50, max 100). Non-numeric or non-positive values fall back to the default; values above 100 are clamped to it.",
      }),
      offset: z.string().optional().openapi({
        description: "Rows to skip (default 0). Non-numeric values fall back to 0; a negative value is rejected with 400.",
      }),
    }),
  },
  responses: {
    200: {
      description: "A page of the document's chunks, ordered by chunkIndex ascending (nulls last), with the document's full chunk count",
      content: {
        "application/json": {
          schema: z.object({ rows: z.array(AdminChunkRow), total: z.number() }),
        },
      },
    },
    400: { description: "Negative offset", content: { "application/json": { schema: ErrorResponse } } },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
  },
});
