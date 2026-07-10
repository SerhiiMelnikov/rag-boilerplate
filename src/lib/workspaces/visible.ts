import { listWorkspaces } from "./admin";
import { resolveVisibleWorkspaceIds } from "./access";
import { createWorkspaceRepo, type WorkspaceRepo } from "./repo";

// The shape the chat header needs. Deliberately narrower than WorkspaceRow:
// description/createdAt are admin-only and never sent to a regular user.
export interface VisibleWorkspace { id: string; name: string; isDefault: boolean }

export interface ListVisibleWorkspacesDeps {
  listWorkspacesFn?: typeof listWorkspaces;
  workspaceRepo?: WorkspaceRepo;
}

// Workspaces this user may switch to: General + explicit grants (admins: all).
// Order comes from listWorkspaces (General first, then alphabetical).
export async function listVisibleWorkspaces(
  userId: string,
  deps: ListVisibleWorkspacesDeps = {},
): Promise<VisibleWorkspace[]> {
  const listFn = deps.listWorkspacesFn ?? listWorkspaces;
  const repo = deps.workspaceRepo ?? createWorkspaceRepo();
  const visible = new Set(await resolveVisibleWorkspaceIds(userId, repo));
  const all = await listFn();
  return all
    .filter((w) => visible.has(w.id))
    .map((w) => ({ id: w.id, name: w.name, isDefault: w.isDefault }));
}
