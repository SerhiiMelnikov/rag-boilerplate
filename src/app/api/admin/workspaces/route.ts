import { listWorkspacesResponse, createWorkspaceResponse } from "@/api/admin/workspaces/handler";

export async function GET(request: Request) {
  return listWorkspacesResponse(request);
}

export async function POST(request: Request) {
  return createWorkspaceResponse(request);
}
