import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth/guards", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/guards");
  return { ...actual, requireAdmin: vi.fn() };
});
vi.mock("@/lib/rag/ingest", () => ({ ingestExistingDocument: vi.fn() }));
const documentRepo = { createDocument: vi.fn(async () => "d1"), setStatus: vi.fn(async () => {}) };
const vectorStore = { existingHashes: vi.fn(), upsertChunks: vi.fn(), deleteByDocument: vi.fn(), searchVector: vi.fn(), searchKeyword: vi.fn() };
vi.mock("@/lib/vectorstore", () => ({ getDocumentRepo: vi.fn(() => documentRepo), getVectorStore: vi.fn(() => vectorStore) }));
vi.mock("@/lib/documents/service", () => ({ listDocuments: vi.fn() }));
const workspaceRepo = { addDocumentToDefault: vi.fn(async () => {}) };
vi.mock("@/lib/workspaces/repo", () => ({ createWorkspaceRepo: vi.fn(() => workspaceRepo) }));
// Run the scheduled background work synchronously so we can assert on it.
vi.mock("next/server", () => ({ after: (fn: any) => void fn() }));
vi.mock("@/lib/config/settings-service", () => ({ getRuntimeSettings: vi.fn(async () => ({})) }));
import { GET, POST } from "@/app/api/admin/documents/route";
import { requireAdmin, ForbiddenError } from "@/lib/auth/guards";
import { ingestExistingDocument } from "@/lib/rag/ingest";
import { listDocuments } from "@/lib/documents/service";
beforeEach(() => {
  vi.clearAllMocks();
  documentRepo.createDocument.mockResolvedValue("d1");
});

function uploadReq(filename = "a.md", content = "hello") {
  const fd = new FormData();
  fd.set("file", new File([content], filename, { type: "text/markdown" }));
  return new Request("http://localhost/api/admin/documents", { method: "POST", body: fd });
}

describe("GET /api/admin/documents", () => {
  it("403 for non-admin", async () => {
    (requireAdmin as any).mockRejectedValue(new ForbiddenError());
    expect((await GET()).status).toBe(403);
  });
  it("lists documents for admin", async () => {
    (requireAdmin as any).mockResolvedValue({ id: "u1", role: "admin" });
    (listDocuments as any).mockResolvedValue([{ id: "d1", filename: "a.md", status: "ready", error: null, createdAt: new Date(0) }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).documents).toHaveLength(1);
  });
});

describe("POST /api/admin/documents", () => {
  it("403 for non-admin", async () => {
    (requireAdmin as any).mockRejectedValue(new ForbiddenError());
    const res = await POST(uploadReq());
    expect(res.status).toBe(403);
    expect(ingestExistingDocument).not.toHaveBeenCalled();
  });
  it("400 when no file", async () => {
    (requireAdmin as any).mockResolvedValue({ id: "u1", role: "admin" });
    const res = await POST(new Request("http://localhost/api/admin/documents", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(400);
  });
  it("creates the row, returns processing immediately, and ingests in the background", async () => {
    (requireAdmin as any).mockResolvedValue({ id: "u1", role: "admin" });
    (ingestExistingDocument as any).mockResolvedValue({ documentId: "d1", status: "ready", chunkCount: 2, skipped: 0 });
    const res = await POST(uploadReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ documentId: "d1", status: "processing" });
    expect(documentRepo.createDocument).toHaveBeenCalledWith("a.md");
    expect(documentRepo.setStatus).toHaveBeenCalledWith("d1", "processing");
    expect(workspaceRepo.addDocumentToDefault).toHaveBeenCalledWith("d1");
    expect(ingestExistingDocument).toHaveBeenCalledWith(
      "d1",
      expect.objectContaining({ filename: "a.md" }),
      expect.objectContaining({ documentRepo: expect.anything(), vectorStore: expect.anything() }),
    );
  });
});
