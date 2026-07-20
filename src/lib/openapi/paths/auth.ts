import { registry } from "../registry";
import { z } from "../zod";
import { SetPasswordRequest } from "../schemas";

// GET/POST /api/auth/{nextauth} (src/app/api/auth/[...nextauth]/route.ts): Auth.js v5's
// own catch-all, re-exported verbatim. Its internals (providers, callbacks, CSRF,
// session shape) are Auth.js's contract, not ours — documented briefly as a surface,
// not enumerated. Public: signing in/out cannot itself require a session.
registry.registerPath({
  method: "get",
  path: "/api/auth/{nextauth}",
  tags: ["Auth"],
  summary: "Auth.js sign-in / callback / session / sign-out surface (library-owned)",
  request: {
    params: z.object({ nextauth: z.string() }),
  },
  responses: {
    200: {
      description: "Varies by sub-route (sign-in page, session JSON, CSRF token, etc.) — see Auth.js docs",
    },
  },
});

// POST /api/auth/verify (src/app/api/auth/verify/handler.ts) — corrected against the
// handler: the brief's table listed this as GET with a `token` query param, but the
// route only exports POST. It is the ONLY place a verification token is consumed (the
// /verify page's GET is deliberately read-only, so an automated link-scanner can never
// complete or destroy a registration on its own). Submitted as a classic HTML form
// (src/app/verify/page.tsx), so the body is form-encoded, not JSON, and the response is
// always a redirect — never a JSON error body, so there is no distinct 400 to document.
registry.registerPath({
  method: "post",
  path: "/api/auth/verify",
  tags: ["Auth"],
  summary: "Consume a verification token and set the account password (form submission from the emailed link)",
  request: {
    body: {
      content: { "application/x-www-form-urlencoded": { schema: SetPasswordRequest } },
    },
  },
  responses: {
    303: {
      description: "Redirects to /login?verified=1 on success, or back to /verify?token=...&error=1 if the token is invalid/expired or the password fails validation",
    },
  },
});
