import { after } from "next/server";
import { ingestUrlResponse } from "@/api/admin/documents/url/handler";

export async function POST(request: Request) {
  return ingestUrlResponse(request, { schedule: (fn) => { after(fn); } });
}
