import { describe, it, expect, vi } from "vitest";
import { setFileWorkspacesResponse } from "./handler";
import { FileNotFoundError, UnknownWorkspaceError } from "@/lib/workspaces/membership";

const admin = vi.fn(async () => ({ id: "a1", role: "admin" }));
const WS = "11111111-1111-4111-8111-111111111111";
const json = (b: unknown) => new Request("http://x/api/admin/files/document/f1/workspaces", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

describe("setFileWorkspacesResponse", () => {
  it("routes documents to setDocumentWorkspaces", async () => {
    const setDocumentWorkspacesFn = vi.fn(async () => {});
    const res = await setFileWorkspacesResponse("document", "f1", json({ workspaceIds: [WS] }), { getAdmin: admin as never, setDocumentWorkspacesFn: setDocumentWorkspacesFn as never });
    expect(res.status).toBe(200);
    expect(setDocumentWorkspacesFn).toHaveBeenCalledWith("f1", [WS]);
  });

  it("routes images to setImageWorkspaces", async () => {
    const setImageWorkspacesFn = vi.fn(async () => {});
    const res = await setFileWorkspacesResponse("image", "i1", json({ workspaceIds: [] }), { getAdmin: admin as never, setImageWorkspacesFn: setImageWorkspacesFn as never });
    expect(res.status).toBe(200);
    expect(setImageWorkspacesFn).toHaveBeenCalledWith("i1", []);
  });

  it("400s on an unknown kind", async () => {
    const res = await setFileWorkspacesResponse("bogus", "f1", json({ workspaceIds: [] }), { getAdmin: admin as never });
    expect(res.status).toBe(400);
  });

  it("400s on a malformed body", async () => {
    const res = await setFileWorkspacesResponse("document", "f1", json({ workspaceIds: ["not-a-uuid"] }), { getAdmin: admin as never });
    expect(res.status).toBe(400);
  });

  it("400s on an unknown workspace id", async () => {
    const setDocumentWorkspacesFn = vi.fn(async () => { throw new UnknownWorkspaceError(); });
    const res = await setFileWorkspacesResponse("document", "f1", json({ workspaceIds: [WS] }), { getAdmin: admin as never, setDocumentWorkspacesFn: setDocumentWorkspacesFn as never });
    expect(res.status).toBe(400);
  });

  it("404s on an unknown file", async () => {
    const setDocumentWorkspacesFn = vi.fn(async () => { throw new FileNotFoundError(); });
    const res = await setFileWorkspacesResponse("document", "nope", json({ workspaceIds: [WS] }), { getAdmin: admin as never, setDocumentWorkspacesFn: setDocumentWorkspacesFn as never });
    expect(res.status).toBe(404);
  });
});
