import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { listFiles } from "@/lib/files/service";

export interface ListFilesDeps {
  getAdmin?: typeof requireAdmin;
  listFilesFn?: typeof listFiles;
}

export async function listFilesResponse(deps: ListFilesDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const listFilesFn = deps.listFilesFn ?? listFiles;
  try {
    await getAdmin();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  return Response.json({ files: await listFilesFn() });
}
