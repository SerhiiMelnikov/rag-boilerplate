import { after } from "next/server";
import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { ingestExistingDocument } from "@/lib/rag/ingest";
import { getVectorStore, getDocumentRepo } from "@/lib/vectorstore";
import { getRuntimeSettings } from "@/lib/config/settings-service";
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

  // Create the row synchronously so it appears in the list immediately, then run
  // the (potentially slow, e.g. multimodal PDF) ingestion in the background.
  // The client polls the list for the status to settle to "ready" / "error".
  const documentRepo = getDocumentRepo();
  const vectorStore = getVectorStore();
  const documentId = await documentRepo.createDocument(file.name);
  await documentRepo.setStatus(documentId, "processing");

  const settings = await getRuntimeSettings();
  after(async () => {
    await ingestExistingDocument(documentId, { filename: file.name, data }, { documentRepo, vectorStore, settings });
  });

  return Response.json({ documentId, status: "processing" });
}
