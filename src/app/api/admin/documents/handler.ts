import { after } from "next/server";
import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { ingestExistingDocument } from "@/lib/rag/ingest";
import { getVectorStore, getDocumentRepo } from "@/lib/vectorstore";
import type { VectorStore, DocumentRepo } from "@/lib/vectorstore/types";
import { createWorkspaceRepo, type WorkspaceRepo } from "@/lib/workspaces/repo";
import { getRuntimeSettings } from "@/lib/config/settings-service";

export interface UploadDocumentDeps {
  getAdmin?: typeof requireAdmin;
  documentRepo?: DocumentRepo;
  vectorStore?: VectorStore;
  workspaceRepo?: WorkspaceRepo;
  getSettings?: typeof getRuntimeSettings;
  ingest?: typeof ingestExistingDocument;
  schedule?: (fn: () => Promise<unknown>) => void;
}

export async function uploadDocument(request: Request, deps: UploadDocumentDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const documentRepo = deps.documentRepo ?? getDocumentRepo();
  const vectorStore = deps.vectorStore ?? getVectorStore();
  const workspaceRepo = deps.workspaceRepo ?? createWorkspaceRepo();
  const getSettings = deps.getSettings ?? getRuntimeSettings;
  const ingest = deps.ingest ?? ingestExistingDocument;
  const schedule = deps.schedule ?? ((fn) => after(fn));

  try {
    await getAdmin();
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

  // Create the row synchronously so it appears in the list immediately, add it to
  // General so workspace scoping keeps it visible, then ingest in the background.
  const documentId = await documentRepo.createDocument(file.name);
  await documentRepo.setStatus(documentId, "processing");
  await workspaceRepo.addDocumentToDefault(documentId);

  const settings = await getSettings();
  schedule(() => ingest(documentId, { filename: file.name, data }, { documentRepo, vectorStore, settings }));

  return Response.json({ documentId, status: "processing" });
}
