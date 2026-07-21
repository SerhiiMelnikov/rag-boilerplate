import { z } from "zod";
import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import {
  listWorkspaceUsers, setWorkspaceGrant,
  WorkspaceNotFoundError, DefaultWorkspaceProtectedError,
} from "@/lib/workspaces/admin";

const grantSchema = z.object({ userId: z.string().uuid(), granted: z.boolean() }).strict();

export interface WorkspaceUsersDeps {
  getAdmin?: typeof requireAdmin;
  listWorkspaceUsersFn?: typeof listWorkspaceUsers;
  setWorkspaceGrantFn?: typeof setWorkspaceGrant;
}

function errorStatus(err: unknown): Response | null {
  if (err instanceof DefaultWorkspaceProtectedError) return Response.json({ error: err.message }, { status: 403 });
  if (err instanceof WorkspaceNotFoundError) return Response.json({ error: err.message }, { status: 404 });
  return null;
}

export async function listWorkspaceUsersResponse(id: string, request: Request, deps: WorkspaceUsersDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const listFn = deps.listWorkspaceUsersFn ?? listWorkspaceUsers;
  try {
    await getAdmin(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  try {
    return Response.json({ users: await listFn(id) });
  } catch (err) {
    const res = errorStatus(err);
    if (res) return res;
    throw err;
  }
}

export async function setWorkspaceGrantResponse(id: string, request: Request, deps: WorkspaceUsersDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const setFn = deps.setWorkspaceGrantFn ?? setWorkspaceGrant;
  try {
    await getAdmin(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "userId and granted are required" }, { status: 400 });
  try {
    await setFn(id, parsed.data.userId, parsed.data.granted);
  } catch (err) {
    const res = errorStatus(err);
    if (res) return res;
    throw err;
  }
  return Response.json({ ok: true });
}
