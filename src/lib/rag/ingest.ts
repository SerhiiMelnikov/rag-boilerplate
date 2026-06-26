import { parseDocument } from "./parse";
import { chunkText } from "./chunk";
import { hashContent } from "./hash";
import { embedDocuments } from "./embeddings";

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
}

export interface IngestResult {
  documentId: string;
  chunkCount: number;
  skipped: number;
  status: "ready" | "error";
  error?: string;
}

// Orchestrates parse -> chunk -> hash/dedupe -> embed -> store, tracking status.
export async function ingestDocument(
  input: { filename: string; data: Buffer },
  deps: IngestDeps,
): Promise<IngestResult> {
  const parse = deps.parse ?? parseDocument;
  const chunk = deps.chunk ?? chunkText;
  const embed = deps.embed ?? embedDocuments;
  const { store } = deps;

  const documentId = await store.createDocument(input.filename);
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
