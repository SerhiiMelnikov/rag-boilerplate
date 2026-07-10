import { z } from "zod";
import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import {
  setDocumentWorkspaces, setImageWorkspaces,
  FileNotFoundError, UnknownWorkspaceError,
} from "@/lib/workspaces/membership";

const bodySchema = z.object({ workspaceIds: z.array(z.string().uuid()) }).strict();

export interface SetFileWorkspacesDeps {
  getAdmin?: typeof requireAdmin;
  setDocumentWorkspacesFn?: typeof setDocumentWorkspaces;
  setImageWorkspacesFn?: typeof setImageWorkspaces;
}

export async function setFileWorkspacesResponse(
  kind: string,
  id: string,
  request: Request,
  deps: SetFileWorkspacesDeps = {},
): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const setDocument = deps.setDocumentWorkspacesFn ?? setDocumentWorkspaces;
  const setImage = deps.setImageWorkspacesFn ?? setImageWorkspaces;

  try {
    await getAdmin();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }

  if (kind !== "document" && kind !== "image") {
    return Response.json({ error: "kind must be \"document\" or \"image\"" }, { status: 400 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "workspaceIds must be an array of uuids" }, { status: 400 });

  try {
    if (kind === "document") await setDocument(id, parsed.data.workspaceIds);
    else await setImage(id, parsed.data.workspaceIds);
  } catch (err) {
    if (err instanceof UnknownWorkspaceError) return Response.json({ error: err.message }, { status: 400 });
    if (err instanceof FileNotFoundError) return Response.json({ error: err.message }, { status: 404 });
    throw err;
  }
  return Response.json({ ok: true });
}
