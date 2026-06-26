import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { ingestDocument } from "@/lib/rag/ingest";
import { createDrizzleStore } from "@/lib/rag/store";
import { listDocuments } from "@/lib/documents/service";

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
  try {
    await requireAdmin();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file is required" }, { status: 400 });
  }
  const data = Buffer.from(await file.arrayBuffer());
  const result = await ingestDocument({ filename: file.name, data }, { store: createDrizzleStore() });
  return Response.json({
    documentId: result.documentId,
    status: result.status,
    chunkCount: result.chunkCount,
    skipped: result.skipped,
  });
}
