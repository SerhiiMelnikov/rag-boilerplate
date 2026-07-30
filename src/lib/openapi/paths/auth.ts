import { registry } from "../registry";
import { z } from "../zod";
import { ErrorResponse, SetPasswordRequest } from "../schemas";

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

// POST /api/auth/login (src/api/auth/login/handler.ts): api-only login — exchanges
// email/password for a bearer session token, minted with the same claim shape/secret
// that getSessionFromRequest decodes (see src/lib/auth/session.ts). Public: you log in
// to GET a session, so no security requirement here.
registry.registerPath({
  method: "post",
  path: "/api/auth/login",
  tags: ["Auth"],
  summary: "Exchange email/password credentials for a bearer session token",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ email: z.string(), password: z.string() }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Credentials verified; returns a bearer token usable as Authorization: Bearer <token>",
      content: { "application/json": { schema: z.object({ token: z.string() }) } },
    },
    400: {
      description: "Invalid JSON body, or email/password missing",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "Invalid credentials",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// POST /api/auth/forgot-password (src/api/auth/forgot-password/handler.ts): public —
// you cannot be signed in to have forgotten your password. Documented as always 200
// on purpose: the uniform response IS the contract here. Any status that varied with
// whether the address exists would make this a user-enumeration oracle, so consumers
// must not expect one.
registry.registerPath({
  method: "post",
  path: "/api/auth/forgot-password",
  tags: ["Auth"],
  summary: "Request a password reset link (always succeeds, whether or not the address has an account)",
  request: {
    body: { content: { "application/json": { schema: z.object({ email: z.string().email() }) } } },
  },
  responses: {
    200: {
      description: "Accepted. A link was sent only if the address belongs to a verified, unblocked account — the response is identical either way.",
      content: { "application/json": { schema: z.object({ status: z.literal("reset_sent") }) } },
    },
    400: {
      description: "Invalid JSON body, or the email failed validation",
      content: { "application/json": { schema: ErrorResponse } },
    },
    429: {
      description: "Rate limited, per address and per email domain. Carries Retry-After.",
      content: { "application/json": { schema: ErrorResponse } },
    },
    503: {
      description: "Email is not configured, sending failed, or AUTH_URL is unset in production",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// POST /api/auth/reset-password (src/api/auth/reset-password/handler.ts): the ONLY
// place a reset token is consumed — the /reset page's GET is deliberately read-only,
// so an automated link-scanner can never burn the user's link. Dual-transport like
// /api/auth/verify: a browser form submission gets a 303, a headless JSON caller
// gets JSON. Public: you cannot be signed in to reset a forgotten password.
registry.registerPath({
  method: "post",
  path: "/api/auth/reset-password",
  tags: ["Auth"],
  summary: "Consume a password reset token and set a new password",
  request: {
    body: {
      content: {
        "application/json": { schema: SetPasswordRequest },
        "application/x-www-form-urlencoded": { schema: SetPasswordRequest },
      },
    },
  },
  responses: {
    200: {
      description: "JSON callers only: the password was reset",
      content: { "application/json": { schema: z.object({ status: z.literal("reset") }) } },
    },
    303: {
      description: "Form callers only: redirects to /login?reset=1 on success, or back to /reset?token=...&error=1 otherwise",
    },
    400: {
      description: "JSON callers only. Invalid JSON, invalid input, or an invalid/expired token — the last is one indistinguishable outcome covering unknown, expired, already-used, unverified and blocked.",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// POST /api/auth/password (src/api/auth/password/handler.ts): the only guarded route
// in this file. Succeeding here retires every session token issued before it — the
// caller's included — which is why the response carries a freshly minted one.
registry.registerPath({
  method: "post",
  path: "/api/auth/password",
  tags: ["Auth"],
  summary: "Change the signed-in user's password (ends all existing sessions)",
  security: [{ sessionCookie: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ currentPassword: z.string(), newPassword: z.string().min(8) }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Password changed. Every previously issued token is now refused; the token returned here replaces the caller's.",
      content: { "application/json": { schema: z.object({ token: z.string() }) } },
    },
    400: {
      description: "Invalid JSON body, or the new password is shorter than 8 characters",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No session, a stale session, or the current password did not match",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// GET /api/auth/oauth/start/{provider} (src/api/auth/oauth/start/handler.ts): the
// GET-safe entry point for the headless flow. Auth.js's own signin action only
// redirects on a POST carrying a CSRF token, which a consumer's link cannot send,
// so this synthesises that POST server-side and relays the redirect verbatim,
// along with every Set-Cookie the provider's configuration calls for (PKCE,
// state, or both — the set varies by provider/configuration, which is why none
// are named individually here). Public — you have no session yet. 404 in a
// full-app build.
registry.registerPath({
  method: "get",
  path: "/api/auth/oauth/start/{provider}",
  tags: ["Auth"],
  summary: "Begin a headless OAuth sign-in with one GET (link- and deep-link-safe)",
  request: { params: z.object({ provider: z.string() }) },
  responses: {
    302: { description: "Redirects to the provider's consent screen, setting whichever check cookies (PKCE and/or state) its callback will later validate" },
    404: { description: "OAUTH_SUCCESS_URL is not configured, or that provider is not configured" },
  },
});

// GET /api/auth/oauth/handoff (src/api/auth/oauth/handoff/handler.ts): the end of the
// headless OAuth flow. Auth.js sets a session cookie on this origin, which a consumer's
// frontend on another origin cannot read; this trades it for a one-time code and redirects
// to OAUTH_SUCCESS_URL. Answers 404 in a full-app deployment, where no consumer exists.
registry.registerPath({
  method: "get",
  path: "/api/auth/oauth/handoff",
  tags: ["Auth"],
  summary: "Exchange the OAuth session cookie for a one-time code and redirect to the configured consumer",
  responses: {
    302: { description: "Redirects to OAUTH_SUCCESS_URL with ?code=... on success, or ?error=oauth_failed with no session" },
    404: { description: "OAUTH_SUCCESS_URL is not configured — there is no headless consumer to hand off to" },
  },
});

// POST /api/auth/oauth/exchange (src/api/auth/oauth/exchange/handler.ts): trades the
// one-time code for a bearer token of the same shape POST /api/auth/login returns.
// Single use, 60-second lifetime; unknown, expired and already-used are one answer.
registry.registerPath({
  method: "post",
  path: "/api/auth/oauth/exchange",
  tags: ["Auth"],
  summary: "Exchange a one-time OAuth handoff code for a bearer session token",
  request: {
    body: { content: { "application/json": { schema: z.object({ code: z.string() }) } } },
  },
  responses: {
    200: {
      description: "Code accepted; returns a bearer token usable as Authorization: Bearer <token>",
      content: { "application/json": { schema: z.object({ token: z.string() }) } },
    },
    400: {
      description: "Invalid JSON, a missing code, or an unknown/expired/already-used code — indistinguishable by design",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: { description: "OAUTH_SUCCESS_URL is not configured" },
  },
});
