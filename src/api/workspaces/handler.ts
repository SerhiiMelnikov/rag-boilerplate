import { requireUser, errorToResponse } from "@/lib/auth/guards";
import { listVisibleWorkspaces } from "@/lib/workspaces/visible";

export interface VisibleWorkspacesDeps {
  getUser?: typeof requireUser;
  listVisibleWorkspacesFn?: typeof listVisibleWorkspaces;
}

// User-facing: only the caller's own visible workspaces. The admin list lives at
// /api/admin/workspaces and is gated separately.
export async function listVisibleWorkspacesResponse(request: Request, deps: VisibleWorkspacesDeps = {}): Promise<Response> {
  const getUser = deps.getUser ?? requireUser;
  const listFn = deps.listVisibleWorkspacesFn ?? listVisibleWorkspaces;

  let user;
  try {
    user = await getUser(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  return Response.json({ workspaces: await listFn(user.id) });
}
