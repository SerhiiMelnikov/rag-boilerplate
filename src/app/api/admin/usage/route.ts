import { getUsageResponse } from "@/api/admin/usage/handler";

export async function GET(request: Request) {
  return getUsageResponse(request);
}
