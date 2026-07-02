import { requireSuperAdmin, errorToResponse } from "@/lib/auth/guards";
import { listUsers } from "@/lib/auth/user-admin";

export async function GET() {
  try {
    await requireSuperAdmin();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  return Response.json({ users: await listUsers() });
}
