import { registry } from "../registry";
import { z } from "../zod";
import { EvalQuestion, EvalRun, EvalResult, ErrorResponse } from "../schemas";

// Request body shared by POST /api/admin/evaluation/questions and
// PATCH /api/admin/evaluation/questions/{id} (src/app/api/admin/evaluation/questions/handler.ts:
// bodySchema). Note: unlike the EvalQuestion response schema, expectedDocumentIds is validated
// as plain strings (not `.uuid()`) and the object is `.strict()` (extra keys rejected).
const EvalQuestionRequest = registry.register("EvalQuestionRequest", z.object({
  question: z.string().min(1),
  expectedDocumentIds: z.array(z.string()),
  referenceAnswer: z.string().optional(),
}).strict().openapi("EvalQuestionRequest"));

// GET /api/admin/evaluation/questions (.../questions/route.ts -> handler.ts: listQuestionsResponse)
registry.registerPath({
  method: "get",
  path: "/api/admin/evaluation/questions",
  tags: ["Admin: Evaluation"],
  summary: "List evaluation questions",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Evaluation questions",
      content: { "application/json": { schema: z.object({ questions: z.array(EvalQuestion) }) } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// POST /api/admin/evaluation/questions (.../questions/route.ts -> handler.ts: createQuestionResponse)
registry.registerPath({
  method: "post",
  path: "/api/admin/evaluation/questions",
  tags: ["Admin: Evaluation"],
  summary: "Create an evaluation question",
  security: [{ sessionCookie: [] }],
  request: {
    body: { content: { "application/json": { schema: EvalQuestionRequest } } },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: z.object({ id: z.string().uuid() }) } },
    },
    400: { description: "Invalid JSON, or question/expectedDocumentIds missing", content: { "application/json": { schema: ErrorResponse } } },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// PATCH /api/admin/evaluation/questions/{id} (.../questions/[id]/route.ts -> handler.ts: updateQuestionResponse)
registry.registerPath({
  method: "patch",
  path: "/api/admin/evaluation/questions/{id}",
  tags: ["Admin: Evaluation"],
  summary: "Update an evaluation question",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { "application/json": { schema: EvalQuestionRequest } } },
  },
  responses: {
    200: {
      description: "Updated",
      content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } },
    },
    400: { description: "Invalid JSON, or question/expectedDocumentIds missing", content: { "application/json": { schema: ErrorResponse } } },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
    404: { description: "Question not found", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// DELETE /api/admin/evaluation/questions/{id} (.../questions/[id]/route.ts -> handler.ts: deleteQuestionResponse)
registry.registerPath({
  method: "delete",
  path: "/api/admin/evaluation/questions/{id}",
  tags: ["Admin: Evaluation"],
  summary: "Delete an evaluation question",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: "Deleted",
      content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
    404: { description: "Question not found", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// GET /api/admin/evaluation/runs (.../runs/route.ts -> handler.ts: listRunsResponse)
registry.registerPath({
  method: "get",
  path: "/api/admin/evaluation/runs",
  tags: ["Admin: Evaluation"],
  summary: "List evaluation runs",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Evaluation runs",
      content: { "application/json": { schema: z.object({ runs: z.array(EvalRun) }) } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// POST /api/admin/evaluation/runs (.../runs/route.ts -> handler.ts: createRunResponse) — no body;
// starts a run against the current runtime settings and schedules it to execute after the
// response is sent (next/server `after`), returning immediately with status "pending".
registry.registerPath({
  method: "post",
  path: "/api/admin/evaluation/runs",
  tags: ["Admin: Evaluation"],
  summary: "Start a new evaluation run",
  security: [{ sessionCookie: [] }],
  responses: {
    201: {
      description: "Run scheduled",
      content: { "application/json": { schema: z.object({ id: z.string().uuid(), status: z.literal("pending") }) } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// GET /api/admin/evaluation/runs/{id} (.../runs/[id]/route.ts -> handler.ts: getRunResponse)
registry.registerPath({
  method: "get",
  path: "/api/admin/evaluation/runs/{id}",
  tags: ["Admin: Evaluation"],
  summary: "Get an evaluation run and its per-question results",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: "Run + results",
      content: {
        "application/json": {
          schema: z.object({ run: EvalRun, results: z.array(EvalResult) }),
        },
      },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
    404: { description: "Run not found", content: { "application/json": { schema: ErrorResponse } } },
  },
});
