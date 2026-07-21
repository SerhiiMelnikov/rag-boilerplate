import { listVisibleWorkspacesResponse } from "@/api/workspaces/handler";

export async function GET() {
  return listVisibleWorkspacesResponse();
}
