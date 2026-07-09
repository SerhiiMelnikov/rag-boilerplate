import type { WorkspaceRepo } from "./repo";

// Workspaces a user may see: General + explicit grants; admins see all.
export async function resolveVisibleWorkspaceIds(userId: string, repo: WorkspaceRepo): Promise<string[]> {
  if (await repo.isAdmin(userId)) return repo.listAllIds();
  const [def, granted] = await Promise.all([repo.getDefaultId(), repo.listGrantedIds(userId)]);
  return [...new Set([def, ...granted])];
}

// Sanitize a requested active workspace to one the user can see (else General).
export async function resolveActiveWorkspaceId(
  requested: string | null | undefined,
  userId: string,
  repo: WorkspaceRepo,
): Promise<string> {
  const visible = await resolveVisibleWorkspaceIds(userId, repo);
  return requested && visible.includes(requested) ? requested : repo.getDefaultId();
}

// Documents visible from an (already-validated) active workspace: active ∪ General.
export async function resolveAllowedDocumentIds(activeWorkspaceId: string, repo: WorkspaceRepo): Promise<string[]> {
  const def = await repo.getDefaultId();
  const scope = [...new Set([activeWorkspaceId, def])];
  return repo.documentIdsIn(scope);
}

// Images visible from an (already-validated) active workspace: active ∪ General.
export async function resolveAllowedImageIds(activeWorkspaceId: string, repo: WorkspaceRepo): Promise<string[]> {
  const def = await repo.getDefaultId();
  const scope = [...new Set([activeWorkspaceId, def])];
  return repo.imageIdsIn(scope);
}
