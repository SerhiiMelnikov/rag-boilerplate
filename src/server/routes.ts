import { Hono } from "hono";
import { Scalar } from "@scalar/hono-api-reference";
import { requireSession } from "./middleware";
import { schedule } from "./schedule";
import { buildOpenApiDocument } from "@/lib/openapi/document";

import { healthCheck } from "@/api/health/handler";
import { loginResponse } from "@/api/auth/login/handler";
import { submitVerification } from "@/api/auth/verify/handler";
import { registerUser } from "@/api/register/handler";
import { handleChat } from "@/api/chat/handler";
import { listConversationsResponse, createConversationResponse } from "@/api/conversations/handler";
import { getConversationResponse, deleteConversationResponse } from "@/api/conversations/[id]/handler";
import { rateMessageResponse } from "@/api/messages/[id]/rating/handler";
import { listVisibleWorkspacesResponse } from "@/api/workspaces/handler";
import { serveImage } from "@/api/images/[id]/handler";

import { listDocumentsResponse, uploadDocument } from "@/api/admin/documents/handler";
import { deleteDocumentResponse } from "@/api/admin/documents/[id]/handler";
import { listFilesResponse } from "@/api/admin/files/handler";
import { setFileWorkspacesResponse } from "@/api/admin/files/[kind]/[id]/workspaces/handler";
import { uploadImage, listImagesResponse } from "@/api/admin/images/handler";
import { patchImageCaption, deleteImageResponse } from "@/api/admin/images/[id]/handler";
import { recaptionImageResponse } from "@/api/admin/images/[id]/recaption/handler";
import { listUsersResponse } from "@/api/admin/users/handler";
import { patchUserResponse } from "@/api/admin/users/[id]/handler";
import { listWorkspacesResponse, createWorkspaceResponse } from "@/api/admin/workspaces/handler";
import { patchWorkspaceResponse, deleteWorkspaceResponse } from "@/api/admin/workspaces/[id]/handler";
import { listWorkspaceUsersResponse, setWorkspaceGrantResponse } from "@/api/admin/workspaces/[id]/users/handler";
import { getSettingsResponse, updateSettingsResponse } from "@/api/admin/settings/handler";
import {
  listQuestionsResponse,
  createQuestionResponse,
  updateQuestionResponse,
  deleteQuestionResponse,
} from "@/api/admin/evaluation/questions/handler";
import { listRunsResponse, createRunResponse, getRunResponse } from "@/api/admin/evaluation/runs/handler";

// Builds the standalone (Next-free) API server: every src/api/** handler wired onto
// a plain Hono routing table. `createServer()` never binds a port (see
// src/server/index.ts for that) so it can be exercised in-memory via `app.request()`
// in tests, exactly like the fetch handler Next.js's route.ts files wrap today.
export function createServer(): Hono {
  const app = new Hono();

  // Coarse session gate, mirroring src/middleware.ts's NextAuth matcher
  // (["/admin/:path*", "/api/chat/:path*", "/api/conversations/:path*", "/api/admin/:path*"]):
  // requires *a* session for these prefixes before a request reaches any handler.
  // Deliberately NOT extended to /api/workspaces, /api/images or /api/messages —
  // src/middleware.ts does not guard those either, so behaviour stays identical
  // between the Next.js and standalone builds. Every one of those still enforces
  // its own auth via requireUser/requireAdmin/requireSuperAdmin inside the handler;
  // this coarse gate only saves an anonymous caller a trip into handler code (and,
  // for admin/chat/conversations, a wasted DB round-trip) — it does not change who
  // is ultimately allowed in.
  app.use("/api/admin/*", requireSession);
  app.use("/api/chat/*", requireSession);
  app.use("/api/conversations/*", requireSession);

  // --- Health -----------------------------------------------------------
  app.get("/api/health", () => healthCheck());

  // --- Auth ---------------------------------------------------------------
  // api-only login replaces Auth.js's [...nextauth] catch-all (not mounted here —
  // there is no Next.js session/cookie sign-in surface in this build).
  app.post("/api/auth/login", (c) => loginResponse(c.req.raw));
  app.post("/api/auth/verify", (c) => submitVerification(c.req.raw));

  // --- Register -----------------------------------------------------------
  app.post("/api/register", (c) => registerUser(c.req.raw));

  // --- Chat -----------------------------------------------------------------
  app.post("/api/chat", (c) => handleChat(c.req.raw));

  // --- Conversations --------------------------------------------------------
  app.get("/api/conversations", (c) => listConversationsResponse(c.req.raw));
  app.post("/api/conversations", (c) => createConversationResponse(c.req.raw));
  app.get("/api/conversations/:id", (c) => getConversationResponse(c.req.raw, c.req.param("id")));
  app.delete("/api/conversations/:id", (c) => deleteConversationResponse(c.req.raw, c.req.param("id")));

  // --- Messages ---------------------------------------------------------------
  app.post("/api/messages/:id/rating", (c) => rateMessageResponse(c.req.param("id"), c.req.raw));

  // --- Workspaces (user-facing) -----------------------------------------------
  app.get("/api/workspaces", (c) => listVisibleWorkspacesResponse(c.req.raw));

  // --- Images -------------------------------------------------------------------
  app.get("/api/images/:id", (c) => serveImage(c.req.param("id"), c.req.raw));

  // --- Admin: Documents -----------------------------------------------------------
  app.get("/api/admin/documents", (c) => listDocumentsResponse(c.req.raw));
  app.post("/api/admin/documents", (c) => uploadDocument(c.req.raw, { schedule }));
  app.delete("/api/admin/documents/:id", (c) => deleteDocumentResponse(c.req.param("id"), c.req.raw));

  // --- Admin: Files -----------------------------------------------------------------
  app.get("/api/admin/files", (c) => listFilesResponse(c.req.raw));
  app.put("/api/admin/files/:kind/:id/workspaces", (c) =>
    setFileWorkspacesResponse(c.req.param("kind"), c.req.param("id"), c.req.raw),
  );

  // --- Admin: Images -----------------------------------------------------------------
  app.get("/api/admin/images", (c) => listImagesResponse(c.req.raw));
  app.post("/api/admin/images", (c) => uploadImage(c.req.raw, { schedule }));
  app.patch("/api/admin/images/:id", (c) => patchImageCaption(c.req.param("id"), c.req.raw, { schedule }));
  app.delete("/api/admin/images/:id", (c) => deleteImageResponse(c.req.raw, c.req.param("id")));
  app.post("/api/admin/images/:id/recaption", (c) =>
    recaptionImageResponse(c.req.param("id"), c.req.raw, { schedule }),
  );

  // --- Admin: Users -----------------------------------------------------------------
  app.get("/api/admin/users", (c) => listUsersResponse(c.req.raw));
  app.patch("/api/admin/users/:id", (c) => patchUserResponse(c.req.param("id"), c.req.raw));

  // --- Admin: Workspaces -----------------------------------------------------------------
  app.get("/api/admin/workspaces", (c) => listWorkspacesResponse(c.req.raw));
  app.post("/api/admin/workspaces", (c) => createWorkspaceResponse(c.req.raw));
  app.patch("/api/admin/workspaces/:id", (c) => patchWorkspaceResponse(c.req.param("id"), c.req.raw));
  app.delete("/api/admin/workspaces/:id", (c) => deleteWorkspaceResponse(c.req.param("id"), c.req.raw));
  app.get("/api/admin/workspaces/:id/users", (c) => listWorkspaceUsersResponse(c.req.param("id"), c.req.raw));
  app.put("/api/admin/workspaces/:id/users", (c) => setWorkspaceGrantResponse(c.req.param("id"), c.req.raw));

  // --- Admin: Settings -----------------------------------------------------------------
  app.get("/api/admin/settings", (c) => getSettingsResponse(c.req.raw));
  app.put("/api/admin/settings", (c) => updateSettingsResponse(c.req.raw));

  // --- Admin: Evaluation -----------------------------------------------------------------
  app.get("/api/admin/evaluation/questions", (c) => listQuestionsResponse(c.req.raw));
  app.post("/api/admin/evaluation/questions", (c) => createQuestionResponse(c.req.raw));
  app.patch("/api/admin/evaluation/questions/:id", (c) => updateQuestionResponse(c.req.param("id"), c.req.raw));
  app.delete("/api/admin/evaluation/questions/:id", (c) => deleteQuestionResponse(c.req.param("id"), c.req.raw));
  app.get("/api/admin/evaluation/runs", (c) => listRunsResponse(c.req.raw));
  app.post("/api/admin/evaluation/runs", (c) => createRunResponse(c.req.raw, { schedule }));
  app.get("/api/admin/evaluation/runs/:id", (c) => getRunResponse(c.req.param("id"), c.req.raw));

  // --- OpenAPI doc + interactive docs ------------------------------------------
  // Public, same as the Next.js build: the contract itself is not a secret, and
  // every documented endpoint above enforces its own auth.
  app.get("/api/openapi.json", (c) => c.json(buildOpenApiDocument()));
  app.get("/docs", Scalar({ url: "/api/openapi.json" }));

  return app;
}
