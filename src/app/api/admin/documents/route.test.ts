import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth/guards", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/guards");
  return { ...actual, requireAdmin: vi.fn() };
});
vi.mock("@/lib/rag/ingest", () => ({ ingestDocument: vi.fn() }));
vi.mock("@/lib/rag/store", () => ({ createDrizzleStore: vi.fn(() => ({})) }));
vi.mock("@/lib/documents/service", () => ({ listDocuments: vi.fn() }));
import { GET, POST } from "@/app/api/admin/documents/route";
import { requireAdmin, ForbiddenError } from "@/lib/auth/guards";
import { ingestDocument } from "@/lib/rag/ingest";
import { listDocuments } from "@/lib/documents/service";
beforeEach(() => vi.clearAllMocks());

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
    (listDocuments as any).mockResolvedValue([{ id: "d1", filename: "a.md", status: "ready", createdAt: new Date(0) }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).documents).toHaveLength(1);
  });
});

describe("POST /api/admin/documents", () => {
  it("400 when no file", async () => {
    (requireAdmin as any).mockResolvedValue({ id: "u1", role: "admin" });
    const res = await POST(new Request("http://localhost/api/admin/documents", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(400);
  });
  it("ingests an uploaded file", async () => {
    (requireAdmin as any).mockResolvedValue({ id: "u1", role: "admin" });
    (ingestDocument as any).mockResolvedValue({ documentId: "d1", status: "ready", chunkCount: 2, skipped: 0 });
    const res = await POST(uploadReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ documentId: "d1", status: "ready", chunkCount: 2, skipped: 0 });
    expect(ingestDocument).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "a.md" }),
      expect.objectContaining({ store: expect.anything() }),
    );
  });
});
