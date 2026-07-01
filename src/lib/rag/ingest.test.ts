import { describe, it, expect, vi } from "vitest";
import { ingestDocument, ingestExistingDocument } from "@/lib/rag/ingest";
import type { RuntimeSettings } from "@/lib/config/settings-service";

const settings = {
  chatProvider: "google", chatModel: "gemma-4-31b-it",
  embeddingProvider: "google", embeddingModel: "gemini-embedding-2",
  parserProvider: "google", parserModel: "gemini-2.5-flash",
  temperature: 0.2, topK: 5, minSimilarity: 0.3, contextTokenBudget: 3000,
  systemPrompt: "sp", ollamaBaseUrl: "http://localhost:11434",
  keys: { google: "gk", openai: null, anthropic: null },
} satisfies RuntimeSettings;

function makeStore(existing: string[] = []) {
  return {
    createDocument: vi.fn(async () => "doc-1"),
    setStatus: vi.fn(async () => {}),
    existingHashes: vi.fn(async () => new Set(existing)),
    insertChunks: vi.fn(async () => {}),
  };
}

describe("ingestDocument", () => {
  it("parses, chunks, embeds new chunks, stores, marks ready", async () => {
    const store = makeStore();
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]));
    const result = await ingestDocument(
      { filename: "a.txt", data: Buffer.from("x") },
      { parse: async () => "hello world", chunk: () => ["c1", "c2"], embed, store, settings },
    );
    expect(result.status).toBe("ready");
    expect(result.chunkCount).toBe(2);
    expect(embed).toHaveBeenCalledWith(["c1", "c2"]);
    expect(store.insertChunks).toHaveBeenCalledOnce();
    expect(store.setStatus).toHaveBeenLastCalledWith("doc-1", "ready");
  });

  it("skips chunks whose content hash already exists (no re-embedding)", async () => {
    const { hashContent } = await import("@/lib/rag/hash");
    const store = makeStore([hashContent("c1")]);
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [0, 0, 0]));
    const result = await ingestDocument(
      { filename: "a.txt", data: Buffer.from("x") },
      { parse: async () => "t", chunk: () => ["c1", "c2"], embed, store, settings },
    );
    expect(embed).toHaveBeenCalledWith(["c2"]); // only the new chunk
    expect(result.skipped).toBe(1);
    expect(result.chunkCount).toBe(1);
  });

  it("ingestExistingDocument processes a pre-created row without creating one", async () => {
    const store = makeStore();
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]));
    const result = await ingestExistingDocument(
      "doc-existing",
      { filename: "a.txt", data: Buffer.from("x") },
      { parse: async () => "hello world", chunk: () => ["c1"], embed, store, settings },
    );
    expect(store.createDocument).not.toHaveBeenCalled();
    expect(result.documentId).toBe("doc-existing");
    expect(store.setStatus).toHaveBeenLastCalledWith("doc-existing", "ready");
  });

  it("marks the document as error when parsing throws", async () => {
    const store = makeStore();
    const result = await ingestDocument(
      { filename: "a.txt", data: Buffer.from("x") },
      { parse: async () => { throw new Error("boom"); }, embed: async () => [], store, settings },
    );
    expect(result.status).toBe("error");
    expect(result.error).toContain("boom");
    expect(store.setStatus).toHaveBeenLastCalledWith("doc-1", "error", expect.stringContaining("boom"));
  });
});
