import { listVisibleWorkspacesResponse } from "./handler";

export async function GET() {
  return listVisibleWorkspacesResponse();
}
