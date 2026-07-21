import { listVisibleWorkspacesResponse } from "@/api/workspaces/handler";

export async function GET(request: Request) {
  return listVisibleWorkspacesResponse(request);
}
