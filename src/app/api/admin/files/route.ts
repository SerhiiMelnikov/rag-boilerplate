import { listFilesResponse } from "@/api/admin/files/handler";

export async function GET(request: Request) {
  return listFilesResponse(request);
}
