import { createRunResponse, listRunsResponse } from "./handler";

export async function GET() {
  return listRunsResponse();
}

export async function POST() {
  return createRunResponse();
}
