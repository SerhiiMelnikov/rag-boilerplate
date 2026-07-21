import { after } from "next/server";
import { listDocumentsResponse, uploadDocument } from "@/api/admin/documents/handler";

export async function GET(request: Request) {
  return listDocumentsResponse(request);
}

export async function POST(request: Request) {
  return uploadDocument(request, { schedule: (fn) => { after(fn); } });
}
