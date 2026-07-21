import { describe, it, expect, vi } from "vitest";
import { uploadDocument } from "./handler";

function form(file: File) {
  const f = new FormData();
  f.set("file", file);
  return new Request("http://x/api/admin/documents", { method: "POST", body: f });
}

const baseDeps = () => ({
  getAdmin: vi.fn(async () => ({ id: "admin-1" })),
  documentRepo: { createDocument: vi.fn(async () => ({ id: "doc-1", created: true })), setStatus: vi.fn(async () => {}) },
  vectorStore: {} as never,
  workspaceRepo: { getDefaultId: vi.fn(async () => "ws-general") },
  setDocumentWorkspacesFn: vi.fn(async () => {}),
  getSettings: vi.fn(async () => ({} as never)),
  ingest: vi.fn(async () => {}),
  schedule: (fn: () => Promise<unknown>) => { void fn(); },
});

describe("uploadDocument", () => {
  it("creates the row and assigns it to the General workspace by default", async () => {
    const deps = baseDeps();
    const res = await uploadDocument(form(new File(["hi"], "a.md", { type: "text/markdown" })), deps as never);
    expect(res.status).toBe(200);
    expect(deps.documentRepo.createDocument).toHaveBeenCalledWith("a.md");
    expect(deps.setDocumentWorkspacesFn).toHaveBeenCalledWith("doc-1", ["ws-general"]);
  });

  it("400s when no file is provided", async () => {
    const deps = baseDeps();
    const res = await uploadDocument(new Request("http://x/api/admin/documents", { method: "POST", body: new FormData() }), deps as never);
    expect(res.status).toBe(400);
    expect(deps.setDocumentWorkspacesFn).not.toHaveBeenCalled();
  });

  it("defaults to the General workspace when no workspaceIds field is sent", async () => {
    const setDocumentWorkspacesFn = vi.fn(async () => {});
    const deps = { ...baseDeps(), setDocumentWorkspacesFn, workspaceRepo: { getDefaultId: async () => "ws-general" } };
    await uploadDocument(form(new File(["hi"], "a.md", { type: "text/markdown" })), deps as never);
    expect(setDocumentWorkspacesFn).toHaveBeenCalledWith("doc-1", ["ws-general"]);
  });

  it("uses the posted workspaceIds", async () => {
    const setDocumentWorkspacesFn = vi.fn(async () => {});
    const f = new FormData();
    f.set("file", new File(["hi"], "a.md", { type: "text/markdown" }));
    f.append("workspaceIds", "w1");
    f.append("workspaceIds", "w2");
    const req = new Request("http://x/api/admin/documents", { method: "POST", body: f });
    const deps = { ...baseDeps(), setDocumentWorkspacesFn, workspaceRepo: { getDefaultId: async () => "ws-general" } };
    await uploadDocument(req, deps as never);
    expect(setDocumentWorkspacesFn).toHaveBeenCalledWith("doc-1", ["w1", "w2"]);
  });

  it("an explicitly empty workspaceIds field leaves the file unassigned", async () => {
    const setDocumentWorkspacesFn = vi.fn(async () => {});
    const f = new FormData();
    f.set("file", new File(["hi"], "a.md", { type: "text/markdown" }));
    f.append("workspaceIds", ""); // sentinel for "explicitly none"
    const req = new Request("http://x/api/admin/documents", { method: "POST", body: f });
    const deps = { ...baseDeps(), setDocumentWorkspacesFn, workspaceRepo: { getDefaultId: async () => "ws-general" } };
    await uploadDocument(req, deps as never);
    expect(setDocumentWorkspacesFn).toHaveBeenCalledWith("doc-1", []);
  });
});
