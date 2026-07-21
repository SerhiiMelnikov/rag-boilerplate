import { after } from "next/server";
import { createRunResponse, listRunsResponse } from "@/api/admin/evaluation/runs/handler";

export async function GET(request: Request) {
  return listRunsResponse(request);
}

export async function POST(request: Request) {
  return createRunResponse(request, { schedule: (fn) => { after(fn); } });
}
