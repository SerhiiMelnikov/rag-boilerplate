import { registry } from "../registry";
import { z } from "../zod";
import { ErrorResponse, RegisterRequest } from "../schemas";

// POST /api/register (src/app/api/register/handler.ts): creates an unverified user and
// emails a verification link; never returns a usable login. Public by definition —
// there is no session yet.
registry.registerPath({
  method: "post",
  path: "/api/register",
  tags: ["Register"],
  summary: "Register a new account; sends a verification email rather than a usable login",
  request: {
    body: { content: { "application/json": { schema: RegisterRequest } } },
  },
  responses: {
    201: {
      description: "Verification email sent",
      content: { "application/json": { schema: z.object({ status: z.literal("verification_sent") }) } },
    },
    400: {
      description: "Invalid JSON body or invalid email",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "The email's domain is not on the allowlist",
      // Extends ErrorResponse: the handler also names the allowed domains — deliberate,
      // since the allowlist is not a secret and the caller must be able to tell why.
      content: {
        "application/json": {
          schema: z.object({ error: z.string(), allowedDomains: z.string() }),
        },
      },
    },
    409: {
      description: "Email already registered and verified",
      content: { "application/json": { schema: ErrorResponse } },
    },
    429: {
      description: "Rate limited (per-address or per-domain bucket)",
      content: { "application/json": { schema: ErrorResponse } },
    },
    503: {
      description: "Registration unavailable (SMTP not configured, or AUTH_URL unset in production)",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});
