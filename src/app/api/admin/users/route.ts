import { listUsersResponse } from "@/api/admin/users/handler";

export async function GET() {
  return listUsersResponse();
}
