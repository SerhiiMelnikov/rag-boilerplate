import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { listDocuments } from "@/lib/documents/service";
import { ingestExistingDocument } from "@/lib/rag/ingest";
import { getVectorStore, getDocumentRepo } from "@/lib/vectorstore";
import type { VectorStore, DocumentRepo } from "@/lib/vectorstore/types";
import { createWorkspaceRepo, type WorkspaceRepo } from "@/lib/workspaces/repo";
import { setDocumentWorkspaces } from "@/lib/workspaces/membership";
import { resolveUploadWorkspaceIds } from "@/lib/workspaces/upload-ids";
import { getRuntimeSettings } from "@/lib/config/settings-service";

export interface ListDocumentsResponseDeps {
  getAdmin?: typeof requireAdmin;
  list?: typeof listDocuments;
}

export async function listDocumentsResponse(request: Request, deps: ListDocumentsResponseDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const list = deps.list ?? listDocuments;

  try {
    await getAdmin();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  return Response.json({ documents: await list() });
}

export interface UploadDocumentDeps {
  getAdmin?: typeof requireAdmin;
  documentRepo?: DocumentRepo;
  vectorStore?: VectorStore;
  workspaceRepo?: WorkspaceRepo;
  setDocumentWorkspacesFn?: typeof setDocumentWorkspaces;
  getSettings?: typeof getRuntimeSettings;
  ingest?: typeof ingestExistingDocument;
  schedule?: (fn: () => Promise<unknown>) => void;
}

export async function uploadDocument(request: Request, deps: UploadDocumentDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const documentRepo = deps.documentRepo ?? getDocumentRepo();
  const vectorStore = deps.vectorStore ?? getVectorStore();
  const workspaceRepo = deps.workspaceRepo ?? createWorkspaceRepo();
  const setDocumentWorkspacesFn = deps.setDocumentWorkspacesFn ?? setDocumentWorkspaces;
  const getSettings = deps.getSettings ?? getRuntimeSettings;
  const ingest = deps.ingest ?? ingestExistingDocument;
  const schedule =
    deps.schedule ??
    ((fn: () => Promise<unknown>) => {
      void Promise.resolve()
        .then(fn)
        .catch((e) => console.error("background job failed", e));
    });

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

  // Create the row synchronously so it appears in the list immediately, assign it
  // to the chosen workspaces (defaulting to General) so scoping keeps it visible,
  // then ingest in the background. Unlike the CLI path, this always writes the
  // admin's explicitly chosen workspaces, whether the row was new or already
  // existed (re-uploading the same filename is an explicit admin action, not an
  // unattended batch re-run).
  const { id: documentId } = await documentRepo.createDocument(file.name);
  await documentRepo.setStatus(documentId, "processing");
  await setDocumentWorkspacesFn(documentId, await resolveUploadWorkspaceIds(form, workspaceRepo));

  const settings = await getSettings();
  schedule(() => ingest(documentId, { filename: file.name, data }, { documentRepo, vectorStore, settings }));

  return Response.json({ documentId, status: "processing" });
}
