import { after } from "next/server";
import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { listDocuments } from "@/lib/documents/service";
import { uploadDocument } from "@/api/admin/documents/handler";

export async function GET() {
  try {
    await requireAdmin();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  return Response.json({ documents: await listDocuments() });
}

export async function POST(request: Request) {
  return uploadDocument(request, { schedule: (fn) => { after(fn); } });
}
