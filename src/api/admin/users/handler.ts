import { requireSuperAdmin, errorToResponse } from "@/lib/auth/guards";
import { listUsers } from "@/lib/auth/user-admin";

export interface UsersDeps {
  getSuperAdmin?: typeof requireSuperAdmin;
  listUsersFn?: typeof listUsers;
}

export async function listUsersResponse(request: Request, deps: UsersDeps = {}): Promise<Response> {
  const getSuperAdmin = deps.getSuperAdmin ?? requireSuperAdmin;
  const listFn = deps.listUsersFn ?? listUsers;
  try {
    await getSuperAdmin(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  return Response.json({ users: await listFn() });
}
