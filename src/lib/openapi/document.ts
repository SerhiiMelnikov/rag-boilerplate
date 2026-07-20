import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { registry } from "./registry";
import "./security";
import "./schemas";
// Path modules are imported for their registration side effects (added in Tasks 2-4):
// import "./paths/health"; ... etc.

const API_VERSION = "0.5.1";

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "rag-boilerplate API",
      version: API_VERSION,
      description: "REST API for the rag-boilerplate app. Endpoints requiring a signed-in session use the sessionCookie scheme.",
    },
    servers: [{ url: "/" }],
    tags: [
      { name: "Health" }, { name: "Auth" }, { name: "Register" }, { name: "Chat" },
      { name: "Conversations" }, { name: "Messages" }, { name: "Workspaces" }, { name: "Images" },
      { name: "Admin: Documents" }, { name: "Admin: Files" }, { name: "Admin: Images" },
      { name: "Admin: Users" }, { name: "Admin: Workspaces" }, { name: "Admin: Settings" },
      { name: "Admin: Evaluation" },
    ],
  });
}
