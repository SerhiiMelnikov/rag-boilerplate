import { z } from "zod";
import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import {
  updateWorkspace, deleteWorkspace,
  WorkspaceNotFoundError, DefaultWorkspaceProtectedError, DuplicateWorkspaceNameError,
} from "@/lib/workspaces/admin";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().max(280).nullable().optional(),
}).strict().refine((v) => v.name !== undefined || v.description !== undefined, {
  message: "name or description is required",
});

export interface WorkspaceItemDeps {
  getAdmin?: typeof requireAdmin;
  updateWorkspaceFn?: typeof updateWorkspace;
  deleteWorkspaceFn?: typeof deleteWorkspace;
}

// Shared mapping of the service's business errors to HTTP statuses.
function errorStatus(err: unknown): Response | null {
  if (err instanceof DefaultWorkspaceProtectedError) return Response.json({ error: err.message }, { status: 403 });
  if (err instanceof WorkspaceNotFoundError) return Response.json({ error: err.message }, { status: 404 });
  if (err instanceof DuplicateWorkspaceNameError) return Response.json({ error: err.message }, { status: 409 });
  return null;
}

export async function patchWorkspaceResponse(id: string, request: Request, deps: WorkspaceItemDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const updateFn = deps.updateWorkspaceFn ?? updateWorkspace;
  try {
    await getAdmin();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "name or description is required" }, { status: 400 });
  try {
    await updateFn(id, parsed.data);
  } catch (err) {
    const res = errorStatus(err);
    if (res) return res;
    throw err;
  }
  return Response.json({ ok: true });
}

export async function deleteWorkspaceResponse(id: string, deps: WorkspaceItemDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const deleteFn = deps.deleteWorkspaceFn ?? deleteWorkspace;
  try {
    await getAdmin();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  try {
    await deleteFn(id);
  } catch (err) {
    const res = errorStatus(err);
    if (res) return res;
    throw err;
  }
  return Response.json({ ok: true });
}
