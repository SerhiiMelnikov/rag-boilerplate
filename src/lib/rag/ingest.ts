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

// Input to ingestExistingDocument: either raw file bytes to be parsed (routed by
// filename extension — the CLI/upload path), or text already extracted elsewhere
// (the URL ingestion path — src/lib/rag/extract-url.ts's Readability output). A
// union, not two optional fields: a URL has no file extension, so if both fields
// were merely optional, a future refactor could reintroduce a call to `parse` on
// this path and it would compile fine, then throw UnsupportedFileTypeError the
// first time it actually ran. Making the two shapes mutually exclusive means the
// compiler — not a caller's discipline — keeps that from happening.
export type IngestExistingInput = { filename: string; data: Buffer } | { filename: string; text: string };

// Processes an already-created document row: parse -> chunk -> hash/dedupe ->
// embed -> store, tracking status. Split out from createDocument so callers can
// create the row synchronously (and show it immediately) while running this in
// the background. Never throws: failures are recorded on the row as "error".
export async function ingestExistingDocument(
  documentId: string,
  input: IngestExistingInput,
  deps: IngestDeps,
): Promise<IngestResult> {
  const parseFn = deps.parse ?? parseDocument;
  const chunk = deps.chunk ?? chunkText;
  const embed = deps.embed ?? ((texts: string[]) => embedDocuments(texts, deps.settings));
  const { documentRepo, vectorStore } = deps;

  try {
    await documentRepo.setStatus(documentId, "processing");
    // When `text` is already extracted, skip `parse` entirely rather than calling
    // it with an absent buffer — see IngestExistingInput's comment for why.
    const text = "text" in input ? input.text : await parseFn(input.filename, input.data, deps.settings);
    const pieces = chunk(text);

    const existing = await vectorStore.existingHashes(documentId);
    const fresh = pieces
      // The index must come from `pieces`, not from the filtered array: on a
      // re-ingest that skips already-stored chunks, `fresh`'s own indices are
      // not document positions.
      .map((content, chunkIndex) => ({ content, chunkIndex, contentHash: hashContent(content) }))
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
        chunkIndex: f.chunkIndex,
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
