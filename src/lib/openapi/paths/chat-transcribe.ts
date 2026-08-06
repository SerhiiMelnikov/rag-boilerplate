import { registry } from "../registry";
import { z } from "../zod";
import { ErrorResponse } from "../schemas";

// POST /api/chat/transcribe (src/api/chat/transcribe/handler.ts): a recorded
// audio blob in, a transcript out. Its own rate-limit bucket, separate from
// /api/chat — this is a distinct paid path.
registry.registerPath({
  method: "post",
  path: "/api/chat/transcribe",
  tags: ["Chat"],
  summary: "Transcribe a recording into text",
  security: [{ sessionCookie: [] }],
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({ audio: z.string().openapi({ type: "string", format: "binary" }) }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The transcript. An empty string means nothing intelligible was heard — this is a success, not an error.",
      content: { "application/json": { schema: z.object({ text: z.string() }) } },
    },
    400: { description: "No audio field", content: { "application/json": { schema: ErrorResponse } } },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    413: { description: "Recording over the size cap", content: { "application/json": { schema: ErrorResponse } } },
    415: { description: "Unsupported audio container", content: { "application/json": { schema: ErrorResponse } } },
    429: { description: "Rate limited (per-minute or per-day quota)", content: { "application/json": { schema: ErrorResponse } } },
    502: { description: "The speech provider rejected the request (e.g. an invalid API key)", content: { "application/json": { schema: ErrorResponse } } },
    503: { description: "No speech-capable provider is configured", content: { "application/json": { schema: ErrorResponse } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/chat/transcribe",
  tags: ["Chat"],
  summary: "Whether voice input can be served right now",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Capability probe — the client renders its microphone on this",
      content: { "application/json": { schema: z.object({ available: z.boolean() }) } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
  },
});
