import { describe, it, expect, vi } from "vitest";
import { uploadDocument } from "./handler";

function form(file: File) {
  const f = new FormData();
  f.set("file", file);
  return new Request("http://x/api/admin/documents", { method: "POST", body: f });
}

const baseDeps = () => ({
  getAdmin: vi.fn(async () => ({ id: "admin-1" })),
  documentRepo: { createDocument: vi.fn(async () => "doc-1"), setStatus: vi.fn(async () => {}) },
  vectorStore: {} as any,
  workspaceRepo: { addDocumentToDefault: vi.fn(async () => {}) },
  getSettings: vi.fn(async () => ({} as any)),
  ingest: vi.fn(async () => {}),
  schedule: (fn: () => Promise<unknown>) => { void fn(); },
});

describe("uploadDocument", () => {
  it("creates the row and adds it to the General workspace", async () => {
    const deps = baseDeps();
    const res = await uploadDocument(form(new File(["hi"], "a.md", { type: "text/markdown" })), deps as any);
    expect(res.status).toBe(200);
    expect(deps.documentRepo.createDocument).toHaveBeenCalledWith("a.md");
    expect(deps.workspaceRepo.addDocumentToDefault).toHaveBeenCalledWith("doc-1");
  });

  it("400s when no file is provided", async () => {
    const deps = baseDeps();
    const res = await uploadDocument(new Request("http://x/api/admin/documents", { method: "POST", body: new FormData() }), deps as any);
    expect(res.status).toBe(400);
    expect(deps.workspaceRepo.addDocumentToDefault).not.toHaveBeenCalled();
  });
});
