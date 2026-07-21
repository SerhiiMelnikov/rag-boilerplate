import { listWorkspacesResponse, createWorkspaceResponse } from "@/api/admin/workspaces/handler";

export async function GET() {
  return listWorkspacesResponse();
}

export async function POST(request: Request) {
  return createWorkspaceResponse(request);
}
