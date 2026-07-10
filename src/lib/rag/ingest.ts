import { parseDocument } from "./parse";
import { chunkText } from "./chunk";
import { hashContent } from "./hash";
import { embedDocuments } from "./embeddings";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import type { DocumentRepo, VectorStore, ChunkInput } from "@/lib/vectorstore/types";
import type { WorkspaceRepo } from "@/lib/workspaces/repo";
import { setDocumentWorkspaces } from "@/lib/workspaces/membership";

export interface IngestDeps {
  parse?: typeof parseDocument;
  chunk?: typeof chunkText;
  embed?: (texts: string[]) => Promise<number[][]>;
  documentRepo: DocumentRepo;
  vectorStore: VectorStore;
  settings: RuntimeSettings;
}

// Deps for ingestDocument (the CLI path): workspaceRepo is required, not
// optional, so the compiler — not a caller's discipline — prevents a new
// document from ever being created without default-workspace membership.
// This is exactly how the original regression happened: an optional dep
// that scripts/ingest.ts simply forgot to pass.
export interface IngestDocumentDeps extends IngestDeps {
  workspaceRepo: WorkspaceRepo;
  // Injectable for tests; defaults to the real membership writer.
  setWorkspaces?: typeof setDocumentWorkspaces;
}

export interface IngestResult {
  documentId: string;
  chunkCount: number;
  skipped: number;
  status: "ready" | "error";
  error?: string;
}

// Processes an already-created document row: parse -> chunk -> hash/dedupe ->
// embed -> store, tracking status. Split out from createDocument so callers can
// create the row synchronously (and show it immediately) while running this in
// the background. Never throws: failures are recorded on the row as "error".
export async function ingestExistingDocument(
  documentId: string,
  input: { filename: string; data: Buffer },
  deps: IngestDeps,
): Promise<IngestResult> {
  const parseFn = deps.parse ?? parseDocument;
  const parse = (filename: string, data: Buffer) => parseFn(filename, data, deps.settings);
  const chunk = deps.chunk ?? chunkText;
  const embed = deps.embed ?? ((texts: string[]) => embedDocuments(texts, deps.settings));
  const { documentRepo, vectorStore } = deps;

  try {
    await documentRepo.setStatus(documentId, "processing");
    const text = await parse(input.filename, input.data);
    const pieces = chunk(text);

    const existing = await vectorStore.existingHashes(documentId);
    const fresh = pieces
      .map((content) => ({ content, contentHash: hashContent(content) }))
      .filter((p) => !existing.has(p.contentHash));
    const skipped = pieces.length - fresh.length;

    if (fresh.length > 0) {
      const embeddings = await embed(fresh.map((f) => f.content));
      const rows: ChunkInput[] = fresh.map((f, i) => ({
        documentId,
        filename: input.filename,
        content: f.content,
        embedding: embeddings[i],
        contentHash: f.contentHash,
      }));
      await vectorStore.upsertChunks(rows);
    }

    await documentRepo.setStatus(documentId, "ready");
    return { documentId, chunkCount: fresh.length, skipped, status: "ready" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await documentRepo.setStatus(documentId, "error", message);
    return { documentId, chunkCount: 0, skipped: 0, status: "error", error: message };
  }
}

// Synchronous convenience used by the CLI: create the row, put it in the
// default workspace, then process it in-line. The web upload path instead
// creates the row, writes its chosen membership, and calls
// ingestExistingDocument in the background.
export async function ingestDocument(
  input: { filename: string; data: Buffer },
  deps: IngestDocumentDeps,
): Promise<IngestResult> {
  const { id: documentId, created } = await deps.documentRepo.createDocument(input.filename);
  // Membership is decided once, at creation. A new document must join the
  // default workspace, or retrieval will never see it. Re-ingesting an
  // existing document (createDocument found it, didn't insert it) must never
  // clobber an assignment an admin made afterward in the admin UI.
  if (created) {
    const setWorkspaces = deps.setWorkspaces ?? setDocumentWorkspaces;
    await setWorkspaces(documentId, [await deps.workspaceRepo.getDefaultId()]);
  }
  return ingestExistingDocument(documentId, input, deps);
}
