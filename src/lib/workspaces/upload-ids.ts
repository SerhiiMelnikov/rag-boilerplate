import type { WorkspaceRepo } from "./repo";

// `workspaceIds` absent => default to [General]. Present (even as the single
// empty-string sentinel the client sends for "explicitly none") => exactly what
// was sent, minus blanks. So an empty selection yields [] — an unassigned file.
export async function resolveUploadWorkspaceIds(form: FormData, workspaceRepo: WorkspaceRepo): Promise<string[]> {
  if (!form.has("workspaceIds")) return [await workspaceRepo.getDefaultId()];
  return form.getAll("workspaceIds").map(String).filter((s) => s.length > 0);
}
