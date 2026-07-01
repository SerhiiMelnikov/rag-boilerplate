import { parseDocument } from "./parse";
import { chunkText } from "./chunk";
import { hashContent } from "./hash";
import { embedDocuments } from "./embeddings";
import type { RuntimeSettings } from "@/lib/config/settings-service";

export interface IngestStore {
  createDocument(filename: string): Promise<string>;
  setStatus(id: string, status: string, error?: string): Promise<void>;
  existingHashes(documentId: string): Promise<Set<string>>;
  insertChunks(
    rows: Array<{ documentId: string; content: string; embedding: number[]; contentHash: string }>,
  ): Promise<void>;
}

export interface IngestDeps {
  parse?: typeof parseDocument;
  chunk?: typeof chunkText;
  embed?: (texts: string[]) => Promise<number[][]>;
  store: IngestStore;
  settings: RuntimeSettings;
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
  const { store } = deps;

  try {
    await store.setStatus(documentId, "processing");
    const text = await parse(input.filename, input.data);
    const pieces = chunk(text);

    const existing = await store.existingHashes(documentId);
    const fresh = pieces
      .map((content) => ({ content, contentHash: hashContent(content) }))
      .filter((p) => !existing.has(p.contentHash));
    const skipped = pieces.length - fresh.length;

    if (fresh.length > 0) {
      const embeddings = await embed(fresh.map((f) => f.content));
      await store.insertChunks(
        fresh.map((f, i) => ({
          documentId,
          content: f.content,
          embedding: embeddings[i],
          contentHash: f.contentHash,
        })),
      );
    }

    await store.setStatus(documentId, "ready");
    return { documentId, chunkCount: fresh.length, skipped, status: "ready" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await store.setStatus(documentId, "error", message);
    return { documentId, chunkCount: 0, skipped: 0, status: "error", error: message };
  }
}

// Synchronous convenience used by the CLI: create the row, then process it
// in-line. The web upload path instead creates the row and calls
// ingestExistingDocument in the background.
export async function ingestDocument(
  input: { filename: string; data: Buffer },
  deps: IngestDeps,
): Promise<IngestResult> {
  const documentId = await deps.store.createDocument(input.filename);
  return ingestExistingDocument(documentId, input, deps);
}
