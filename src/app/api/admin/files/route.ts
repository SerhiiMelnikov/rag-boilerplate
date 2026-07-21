import { listFilesResponse } from "@/api/admin/files/handler";

export async function GET() {
  return listFilesResponse();
}
