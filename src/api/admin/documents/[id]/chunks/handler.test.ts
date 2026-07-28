import { describe, it, expect, vi } from "vitest";
import { getDocumentChunksResponse } from "./handler";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/guards";

const admin = vi.fn(async () => ({ id: "a1", role: "admin" as const, isSuperAdmin: false }));
const req = (query = "") => new Request(`http://x/api/admin/documents/d1/chunks${query}`);

// Deliberately includes a null chunkIndex row: a legacy chunk ingested before Task 1
// recorded position. The handler must pass it through as null, not coerce it to 0 or
// drop the field.
const page = {
  rows: [
    { chunkIndex: 0, content: "first", contentHash: "h1" },
    { chunkIndex: null, content: "legacy chunk", contentHash: "h2" },
  ],
  total: 2,
};

describe("getDocumentChunksResponse", () => {
  it("200s with rows and total passed through unchanged, including a null chunkIndex", async () => {
    const listChunks = vi.fn(async () => page);
    const res = await getDocumentChunksResponse("d1", req(), {
      getAdmin: admin as never,
      vectorStore: { listChunks } as never,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(page);
  });

  it("403s a forbidden (non-admin) caller and does not touch the vector store", async () => {
    const forbidden = vi.fn(async () => { throw new ForbiddenError(); });
    const listChunks = vi.fn(async () => page);
    const res = await getDocumentChunksResponse("d1", req(), {
      getAdmin: forbidden as never,
      vectorStore: { listChunks } as never,
    });

    expect(res.status).toBe(403);
    expect(listChunks).not.toHaveBeenCalled();
  });

  it("401s an unauthenticated caller rather than 500ing", async () => {
    const unauthorized = vi.fn(async () => { throw new UnauthorizedError(); });
    const res = await getDocumentChunksResponse("d1", req(), { getAdmin: unauthorized as never });
    expect(res.status).toBe(401);
  });

  it("defaults limit to 50 and offset to 0 when both are absent", async () => {
    const listChunks = vi.fn(async () => page);
    await getDocumentChunksResponse("d1", req(), { getAdmin: admin as never, vectorStore: { listChunks } as never });
    expect(listChunks).toHaveBeenCalledWith("d1", { limit: 50, offset: 0 });
  });

  it("defaults limit and offset when both are the empty string", async () => {
    const listChunks = vi.fn(async () => page);
    await getDocumentChunksResponse("d1", req("?limit=&offset="), {
      getAdmin: admin as never,
      vectorStore: { listChunks } as never,
    });
    expect(listChunks).toHaveBeenCalledWith("d1", { limit: 50, offset: 0 });
  });

  it("honours an in-range limit and offset", async () => {
    const listChunks = vi.fn(async () => page);
    await getDocumentChunksResponse("d1", req("?limit=10&offset=20"), {
      getAdmin: admin as never,
      vectorStore: { listChunks } as never,
    });
    expect(listChunks).toHaveBeenCalledWith("d1", { limit: 10, offset: 20 });
  });

  it("clamps an enormous limit down to 100", async () => {
    const listChunks = vi.fn(async () => page);
    await getDocumentChunksResponse("d1", req("?limit=1000000"), {
      getAdmin: admin as never,
      vectorStore: { listChunks } as never,
    });
    expect(listChunks).toHaveBeenCalledWith("d1", { limit: 100, offset: 0 });
  });

  it("falls back to the default limit when it is non-numeric", async () => {
    const listChunks = vi.fn(async () => page);
    await getDocumentChunksResponse("d1", req("?limit=banana"), {
      getAdmin: admin as never,
      vectorStore: { listChunks } as never,
    });
    expect(listChunks).toHaveBeenCalledWith("d1", { limit: 50, offset: 0 });
  });

  it("falls back to the default limit when it is zero or negative", async () => {
    const listChunks = vi.fn(async () => page);
    await getDocumentChunksResponse("d1", req("?limit=0"), {
      getAdmin: admin as never,
      vectorStore: { listChunks } as never,
    });
    expect(listChunks).toHaveBeenCalledWith("d1", { limit: 50, offset: 0 });

    listChunks.mockClear();
    await getDocumentChunksResponse("d1", req("?limit=-5"), {
      getAdmin: admin as never,
      vectorStore: { listChunks } as never,
    });
    expect(listChunks).toHaveBeenCalledWith("d1", { limit: 50, offset: 0 });
  });

  it("falls back to offset 0 when it is non-numeric", async () => {
    const listChunks = vi.fn(async () => page);
    await getDocumentChunksResponse("d1", req("?offset=banana"), {
      getAdmin: admin as never,
      vectorStore: { listChunks } as never,
    });
    expect(listChunks).toHaveBeenCalledWith("d1", { limit: 50, offset: 0 });
  });

  it("400s a negative offset rather than passing it through, and does not touch the vector store", async () => {
    const listChunks = vi.fn(async () => page);
    const res = await getDocumentChunksResponse("d1", req("?offset=-1"), {
      getAdmin: admin as never,
      vectorStore: { listChunks } as never,
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "offset must not be negative" });
    expect(listChunks).not.toHaveBeenCalled();
  });
});
