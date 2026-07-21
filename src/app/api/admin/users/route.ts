import { listUsersResponse } from "@/api/admin/users/handler";

export async function GET(request: Request) {
  return listUsersResponse(request);
}
