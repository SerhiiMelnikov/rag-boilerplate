import { describe, it, expect } from "vitest";
import { buildOpenApiDocument } from "./document";

describe("buildOpenApiDocument", () => {
  const doc = buildOpenApiDocument();
  it("is a valid OpenAPI 3.0 document shell", () => {
    expect(doc.openapi).toBe("3.0.3");
    expect(doc.info.title).toBeTruthy();
    expect(doc.info.version).toBe("0.5.1");
  });
  it("declares the sessionCookie security scheme", () => {
    expect(doc.components?.securitySchemes?.sessionCookie).toMatchObject({ type: "apiKey", in: "cookie" });
  });
  it("registers the core component schemas", () => {
    for (const name of ["ErrorResponse", "SourceRef", "ImageResult", "Conversation", "Message", "Workspace"]) {
      expect(doc.components?.schemas?.[name]).toBeTruthy();
    }
  });
  it("documents core client endpoints", () => {
    expect(doc.paths?.["/api/health"]?.get).toBeTruthy();
    expect(doc.paths?.["/api/conversations"]?.get?.security).toEqual([{ sessionCookie: [] }]);
    expect(doc.paths?.["/api/chat"]?.post).toBeTruthy();
    expect(doc.paths?.["/api/register"]?.post).toBeTruthy(); // public: no security
    expect(doc.paths?.["/api/register"]?.post?.security).toBeUndefined();
  });
});
