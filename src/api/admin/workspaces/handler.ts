import { z } from "zod";
import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { listWorkspaces, createWorkspace, DuplicateWorkspaceNameError } from "@/lib/workspaces/admin";

const createSchema = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(280).optional(),
}).strict();

export interface WorkspacesDeps {
  getAdmin?: typeof requireAdmin;
  listWorkspacesFn?: typeof listWorkspaces;
  createWorkspaceFn?: typeof createWorkspace;
}

export async function listWorkspacesResponse(request: Request, deps: WorkspacesDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const listFn = deps.listWorkspacesFn ?? listWorkspaces;
  try {
    await getAdmin(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  return Response.json({ workspaces: await listFn() });
}

export async function createWorkspaceResponse(request: Request, deps: WorkspacesDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const createFn = deps.createWorkspaceFn ?? createWorkspace;
  try {
    await getAdmin(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "name is required" }, { status: 400 });
  try {
    const id = await createFn({ name: parsed.data.name, description: parsed.data.description ?? null });
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateWorkspaceNameError) return Response.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
