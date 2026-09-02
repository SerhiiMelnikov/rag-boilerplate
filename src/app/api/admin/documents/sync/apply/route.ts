import { after } from "next/server";
import { syncApplyResponse } from "@/api/admin/documents/sync/handler";
export async function POST(request: Request) {
  return syncApplyResponse(request, { schedule: (fn) => { after(fn); } });
}
