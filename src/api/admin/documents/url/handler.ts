import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { extractFromUrl } from "@/lib/rag/extract-url";
import { ingestExistingDocument } from "@/lib/rag/ingest";
import { getVectorStore, getDocumentRepo } from "@/lib/vectorstore";
import type { VectorStore, DocumentRepo } from "@/lib/vectorstore/types";
import { createWorkspaceRepo, type WorkspaceRepo } from "@/lib/workspaces/repo";
import { setDocumentWorkspaces } from "@/lib/workspaces/membership";
import { getRuntimeSettings } from "@/lib/config/settings-service";

export interface IngestUrlDeps {
  getAdmin?: typeof requireAdmin;
  documentRepo?: DocumentRepo;
  vectorStore?: VectorStore;
  workspaceRepo?: WorkspaceRepo;
  setDocumentWorkspacesFn?: typeof setDocumentWorkspaces;
  getSettings?: typeof getRuntimeSettings;
  extract?: typeof extractFromUrl;
  ingest?: typeof ingestExistingDocument;
  schedule?: (fn: () => Promise<unknown>) => void;
}

// POST /api/admin/documents/url { url }: fetches the page, extracts its readable
// article text (Readability, via extractFromUrl), and ingests it exactly like an
// uploaded file — except the source bytes never touch disk and there is no file
// extension to route parsing by (which is exactly why ingestExistingDocument's
// `text` input exists: it skips `parse` entirely for this path).
export async function ingestUrlResponse(request: Request, deps: IngestUrlDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const documentRepo = deps.documentRepo ?? getDocumentRepo();
  const vectorStore = deps.vectorStore ?? getVectorStore();
  const workspaceRepo = deps.workspaceRepo ?? createWorkspaceRepo();
  const setDocumentWorkspacesFn = deps.setDocumentWorkspacesFn ?? setDocumentWorkspaces;
  const getSettings = deps.getSettings ?? getRuntimeSettings;
  const extract = deps.extract ?? extractFromUrl;
  const ingest = deps.ingest ?? ingestExistingDocument;
  const schedule =
    deps.schedule ??
    ((fn: () => Promise<unknown>) => {
      void Promise.resolve()
        .then(fn)
        .catch((e) => console.error("background job failed", e));
    });

  try {
    await getAdmin(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "url is required" }, { status: 400 });
  }
  const url = body && typeof body === "object" && "url" in body ? (body as { url?: unknown }).url : undefined;
  if (typeof url !== "string" || url.trim() === "") {
    return Response.json({ error: "url is required" }, { status: 400 });
  }

  // Fetch + Readability extraction runs synchronously here (bounded to 15s inside
  // extractFromUrl) so a bad URL — malformed syntax, an unfetchable host, a non-HTML
  // response, an oversized body — is reported to the caller immediately as a 400,
  // instead of only surfacing later as an "error" status on a row the admin has to
  // go find. Only the slower chunk/embed/store work is pushed to the background.
  let article: { title: string; text: string };
  try {
    article = await extract(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }

  // filename = the URL itself. documents.filename is unique, so re-posting the same
  // URL updates that document (createDocument reports created: false) instead of
  // creating a duplicate — intended, so an admin can refresh a page's ingested copy.
  const { id: documentId } = await documentRepo.createDocument(url);
  await documentRepo.setStatus(documentId, "processing");
  // Mirrors uploadDocument: always (re-)assign the default workspace, whether the
  // row is new or already existed — posting a URL is an explicit admin action each
  // time, not an unattended batch re-run (unlike the CLI path, which only assigns
  // membership on first creation).
  await setDocumentWorkspacesFn(documentId, [await workspaceRepo.getDefaultId()]);

  const settings = await getSettings();
  schedule(() => ingest(documentId, { filename: url, text: article.text }, { documentRepo, vectorStore, settings }));

  return Response.json({ documentId, status: "processing" });
}
