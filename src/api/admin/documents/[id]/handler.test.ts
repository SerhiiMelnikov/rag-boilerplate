import { describe, it, expect, vi } from "vitest";
import { deleteDocumentResponse } from "./handler";
import { ForbiddenError } from "@/lib/auth/guards";

const admin = vi.fn(async () => ({ id: "u1", role: "admin", isSuperAdmin: false }));

describe("deleteDocumentResponse", () => {
  it("403s a non-admin and does not touch the service", async () => {
    const deleteDocumentFn = vi.fn();
    const res = await deleteDocumentResponse("d1", {
      getAdmin: (async () => { throw new ForbiddenError(); }) as never,
      deleteDocumentFn: deleteDocumentFn as never,
    });
    expect(res.status).toBe(403);
    expect(deleteDocumentFn).not.toHaveBeenCalled();
  });

  it("204s when the document is deleted successfully", async () => {
    const deleteDocumentFn = vi.fn(async () => true);
    const res = await deleteDocumentResponse("d1", { getAdmin: admin as never, deleteDocumentFn: deleteDocumentFn as never });
    expect(res.status).toBe(204);
    expect(deleteDocumentFn).toHaveBeenCalledWith("d1");
  });

  it("404s when the document does not exist", async () => {
    const deleteDocumentFn = vi.fn(async () => false);
    const res = await deleteDocumentResponse("missing", { getAdmin: admin as never, deleteDocumentFn: deleteDocumentFn as never });
    expect(res.status).toBe(404);
  });
});
