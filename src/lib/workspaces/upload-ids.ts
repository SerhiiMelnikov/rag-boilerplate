import type { WorkspaceRepo } from "./repo";

// The rule, independent of how the ids arrived: absent => [General]; present
// (even empty) => exactly what was sent, minus blanks. An empty selection is a
// deliberate "unassigned", not a mistake, and stays excluded from retrieval.
export async function resolveWorkspaceIds(ids: string[] | undefined, workspaceRepo: WorkspaceRepo): Promise<string[]> {
  if (ids === undefined) return [await workspaceRepo.getDefaultId()];
  return ids.filter((s) => s.length > 0);
}

// Multipart transport. The client sends a single empty-string entry to mean
// "explicitly none", which is why presence is tested on the field, not the values.
export async function resolveUploadWorkspaceIds(form: FormData, workspaceRepo: WorkspaceRepo): Promise<string[]> {
  return resolveWorkspaceIds(form.has("workspaceIds") ? form.getAll("workspaceIds").map(String) : undefined, workspaceRepo);
}
