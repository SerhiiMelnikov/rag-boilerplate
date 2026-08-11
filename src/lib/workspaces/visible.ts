import { listWorkspacesCore } from "./admin";
import { resolveVisibleWorkspaceIds } from "./access";
import { createWorkspaceRepo, type WorkspaceRepo } from "./repo";

// The shape the chat header needs. Deliberately narrower than WorkspaceSummary:
// description/createdAt are admin-only and never sent to a regular user.
export interface VisibleWorkspace { id: string; name: string; isDefault: boolean }

export interface ListVisibleWorkspacesDeps {
  listWorkspacesFn?: typeof listWorkspacesCore;
  workspaceRepo?: WorkspaceRepo;
}

// Workspaces this user may switch to: General + explicit grants (admins: all).
// Order comes from listWorkspacesCore (General first, then alphabetical). Uses
// the narrow projection deliberately: this backs GET /api/workspaces, which
// every user hits on every page load, and it never reads userCount — so it
// must not pay for listWorkspaces' join + count(*) scan. See listWorkspacesCore's
// comment in admin.ts.
export async function listVisibleWorkspaces(
  userId: string,
  deps: ListVisibleWorkspacesDeps = {},
): Promise<VisibleWorkspace[]> {
  const listFn = deps.listWorkspacesFn ?? listWorkspacesCore;
  const repo = deps.workspaceRepo ?? createWorkspaceRepo();
  const visible = new Set(await resolveVisibleWorkspaceIds(userId, repo));
  const all = await listFn();
  return all
    .filter((w) => visible.has(w.id))
    .map((w) => ({ id: w.id, name: w.name, isDefault: w.isDefault }));
}
