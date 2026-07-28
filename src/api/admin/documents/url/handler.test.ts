import { describe, it, expect, vi } from "vitest";
import { ingestUrlResponse } from "./handler";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/guards";
import { InvalidUrlError } from "@/lib/rag/extract-url";

function req(body: unknown) {
  return new Request("http://x/api/admin/documents/url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const baseDeps = () => ({
  getAdmin: vi.fn(async () => ({ id: "admin-1" })),
  documentRepo: { createDocument: vi.fn(async () => ({ id: "doc-1", created: true })), setStatus: vi.fn(async () => {}) },
  vectorStore: {} as never,
  workspaceRepo: { getDefaultId: vi.fn(async () => "ws-general") },
  setDocumentWorkspacesFn: vi.fn(async () => {}),
  getSettings: vi.fn(async () => ({} as never)),
  extract: vi.fn(async () => ({ title: "An Article", text: "extracted article text" })),
  ingest: vi.fn(async () => ({ documentId: "doc-1", status: "ready" as const, chunkCount: 1, skipped: 0 })),
  schedule: (fn: () => Promise<unknown>) => fn(),
});

describe("ingestUrlResponse", () => {
  it("extracts the URL, creates the row with filename = url, assigns the default workspace, and schedules ingestion with the extracted text", async () => {
    const deps = baseDeps();
    const res = await ingestUrlResponse(req({ url: "https://example.com/a" }), deps as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ documentId: "doc-1", status: "processing" });
    expect(deps.extract).toHaveBeenCalledWith("https://example.com/a");
    expect(deps.documentRepo.createDocument).toHaveBeenCalledWith("https://example.com/a");
    expect(deps.setDocumentWorkspacesFn).toHaveBeenCalledWith("doc-1", ["ws-general"]);
    expect(deps.ingest).toHaveBeenCalledWith(
      "doc-1",
      { filename: "https://example.com/a", text: "extracted article text" },
      expect.objectContaining({ documentRepo: deps.documentRepo, vectorStore: deps.vectorStore }),
    );
  });

  it("400s when url is missing", async () => {
    const deps = baseDeps();
    const res = await ingestUrlResponse(req({}), deps as never);
    expect(res.status).toBe(400);
    expect(deps.extract).not.toHaveBeenCalled();
    expect(deps.documentRepo.createDocument).not.toHaveBeenCalled();
  });

  it("400s when the request body isn't valid JSON", async () => {
    const deps = baseDeps();
    const res = await ingestUrlResponse(
      new Request("http://x/api/admin/documents/url", { method: "POST", body: "not json" }),
      deps as never,
    );
    expect(res.status).toBe(400);
  });

  it("400s an invalid URL and never creates a document", async () => {
    const deps = { ...baseDeps(), extract: vi.fn(async () => { throw new InvalidUrlError("Invalid URL: not-a-url"); }) };
    const res = await ingestUrlResponse(req({ url: "not-a-url" }), deps as never);
    expect(res.status).toBe(400);
    expect(deps.documentRepo.createDocument).not.toHaveBeenCalled();
  });

  it("401s an anonymous caller and never extracts", async () => {
    const deps = { ...baseDeps(), getAdmin: vi.fn(async () => { throw new UnauthorizedError(); }) };
    const res = await ingestUrlResponse(req({ url: "https://example.com" }), deps as never);
    expect(res.status).toBe(401);
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it("403s a signed-in non-admin caller", async () => {
    const deps = { ...baseDeps(), getAdmin: vi.fn(async () => { throw new ForbiddenError(); }) };
    const res = await ingestUrlResponse(req({ url: "https://example.com" }), deps as never);
    expect(res.status).toBe(403);
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it("re-posting the same URL updates the existing document instead of creating a duplicate", async () => {
    const deps = {
      ...baseDeps(),
      documentRepo: { createDocument: vi.fn(async () => ({ id: "doc-1", created: false })), setStatus: vi.fn(async () => {}) },
    };
    const res = await ingestUrlResponse(req({ url: "https://example.com/a" }), deps as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ documentId: "doc-1", status: "processing" });
    // documents.filename is unique: createDocument reporting created: false means the row
    // already existed for this exact URL. Re-posting it must still (re-)assign the default
    // workspace and schedule a fresh ingest, not silently no-op.
    expect(deps.setDocumentWorkspacesFn).toHaveBeenCalledWith("doc-1", ["ws-general"]);
    expect(deps.ingest).toHaveBeenCalled();
  });
});
