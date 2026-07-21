import { after } from "next/server";
import { createRunResponse, listRunsResponse } from "@/api/admin/evaluation/runs/handler";

export async function GET() {
  return listRunsResponse();
}

export async function POST() {
  return createRunResponse({ schedule: (fn) => { after(fn); } });
}
