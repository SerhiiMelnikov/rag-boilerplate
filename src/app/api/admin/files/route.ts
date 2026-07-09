import { listFilesResponse } from "./handler";

export async function GET() {
  return listFilesResponse();
}
