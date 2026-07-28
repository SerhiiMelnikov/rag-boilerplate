import { describe, it, expect, vi } from "vitest";
import { ingestDocument, ingestExistingDocument } from "@/lib/rag/ingest";
import { hashContent } from "@/lib/rag/hash";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import type { ChunkInput } from "@/lib/vectorstore/types";

const settings = {
  chatProvider: "google", chatModel: "gemma-4-31b-it",
  embeddingProvider: "google", embeddingModel: "gemini-embedding-2",
  parserProvider: "google", parserModel: "gemini-2.5-flash",
  imageProvider: "google", imageModel: "gemini-2.5-flash",
  unifiedMode: false, unifiedProvider: "google", unifiedModel: "gemma-4-31b-it",
  temperature: 0.2, topK: 5, minSimilarity: 0.3, contextTokenBudget: 3000,
  systemPrompt: "sp", ollamaBaseUrl: "http://localhost:11434",
  chatRateLimitPerMinute: 20, chatRateLimitPerDay: 200,
  allowedEmailDomains: "",
  smtpHost: "", smtpPort: 587, smtpUser: "", smtpFrom: "",
  keys: { google: "gk", openai: null, anthropic: null },
  smtpPassword: null,
} satisfies RuntimeSettings;

function makeDocumentRepo(id = "doc-1", created = true) {
  return {
    createDocument: vi.fn(async () => ({ id, created })),
    setStatus: vi.fn(async () => {}),
  };
}

function makeVectorStore(existing: string[] = []) {
  return {
    existingHashes: vi.fn(async () => new Set(existing)),
    upsertChunks: vi.fn(async () => {}),
    deleteByDocument: vi.fn(async () => {}),
    searchVector: vi.fn(async () => []),
    searchKeyword: vi.fn(async () => []),
    listChunks: vi.fn(async () => ({ rows: [], total: 0 })),
  };
}

describe("ingestDocument", () => {
  it("parses, chunks, embeds new chunks, stores, marks ready", async () => {
    const documentRepo = makeDocumentRepo();
    const vectorStore = makeVectorStore();
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]));
    const result = await ingestDocument(
      { filename: "a.txt", data: Buffer.from("x") },
      {
        parse: async () => "hello world", chunk: () => ["c1", "c2"], embed, documentRepo, vectorStore, settings,
        workspaceRepo: { getDefaultId: async () => "ws-general" } as never,
        setWorkspaces: vi.fn(async () => {}),
      },
    );
    expect(result.status).toBe("ready");
    expect(result.chunkCount).toBe(2);
    expect(embed).toHaveBeenCalledWith(["c1", "c2"]);
    expect(vectorStore.upsertChunks).toHaveBeenCalledOnce();
    expect(vectorStore.upsertChunks).toHaveBeenCalledWith([
      expect.objectContaining({ documentId: "doc-1", filename: "a.txt", content: "c1" }),
      expect.objectContaining({ documentId: "doc-1", filename: "a.txt", content: "c2" }),
    ]);
    expect(documentRepo.setStatus).toHaveBeenLastCalledWith("doc-1", "ready");
  });

  it("skips chunks whose content hash already exists (no re-embedding)", async () => {
    const { hashContent } = await import("@/lib/rag/hash");
    const documentRepo = makeDocumentRepo();
    const vectorStore = makeVectorStore([hashContent("c1")]);
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [0, 0, 0]));
    const result = await ingestDocument(
      { filename: "a.txt", data: Buffer.from("x") },
      {
        parse: async () => "t", chunk: () => ["c1", "c2"], embed, documentRepo, vectorStore, settings,
        workspaceRepo: { getDefaultId: async () => "ws-general" } as never,
        setWorkspaces: vi.fn(async () => {}),
      },
    );
    expect(embed).toHaveBeenCalledWith(["c2"]); // only the new chunk
    expect(result.skipped).toBe(1);
    expect(result.chunkCount).toBe(1);
  });

  it("ingestExistingDocument processes a pre-created row without creating one", async () => {
    const documentRepo = makeDocumentRepo();
    const vectorStore = makeVectorStore();
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]));
    const result = await ingestExistingDocument(
      "doc-existing",
      { filename: "a.txt", data: Buffer.from("x") },
      { parse: async () => "hello world", chunk: () => ["c1"], embed, documentRepo, vectorStore, settings },
    );
    expect(documentRepo.createDocument).not.toHaveBeenCalled();
    expect(result.documentId).toBe("doc-existing");
    expect(documentRepo.setStatus).toHaveBeenLastCalledWith("doc-existing", "ready");
  });

  it("marks the document as error when parsing throws", async () => {
    const documentRepo = makeDocumentRepo();
    const vectorStore = makeVectorStore();
    const result = await ingestDocument(
      { filename: "a.txt", data: Buffer.from("x") },
      {
        parse: async () => { throw new Error("boom"); }, embed: async () => [], documentRepo, vectorStore, settings,
        workspaceRepo: { getDefaultId: async () => "ws-general" } as never,
        setWorkspaces: vi.fn(async () => {}),
      },
    );
    expect(result.status).toBe("error");
    expect(result.error).toContain("boom");
    expect(documentRepo.setStatus).toHaveBeenLastCalledWith("doc-1", "error", expect.stringContaining("boom"));
  });

  it("ingestDocument assigns the default workspace when createDocument reports created: true (new document)", async () => {
    const setWorkspaces = vi.fn(async () => {});
    const documentRepo = { createDocument: vi.fn(async () => ({ id: "doc-9", created: true })), setStatus: vi.fn(async () => {}) };
    await ingestDocument(
      { filename: "a.md", data: Buffer.from("hello world") },
      {
        documentRepo: documentRepo as never,
        vectorStore: { upsertChunks: vi.fn(async () => {}), existingHashes: vi.fn(async () => new Set<string>()) } as never,
        settings: {} as never,
        parse: async () => "hello world",
        chunk: () => [{ content: "hello world", index: 0 }] as never,
        embed: async () => [[0.1]],
        workspaceRepo: { getDefaultId: async () => "ws-general" } as never,
        setWorkspaces,
      },
    );
    expect(setWorkspaces).toHaveBeenCalledWith("doc-9", ["ws-general"]);
  });

  it("ingestDocument does NOT touch workspace membership when createDocument reports created: false (re-ingest of an existing document)", async () => {
    const setWorkspaces = vi.fn(async () => {});
    const upsertChunks = vi.fn(async () => {});
    const setStatus = vi.fn(async () => {});
    const documentRepo = {
      createDocument: vi.fn(async () => ({ id: "doc-existing", created: false })),
      setStatus,
    };
    const result = await ingestDocument(
      { filename: "a.md", data: Buffer.from("hello world") },
      {
        documentRepo: documentRepo as never,
        vectorStore: { upsertChunks, existingHashes: vi.fn(async () => new Set<string>()) } as never,
        settings: {} as never,
        parse: async () => "hello world",
        chunk: () => ["hello world"],
        embed: async () => [[0.1]],
        workspaceRepo: { getDefaultId: async () => "ws-general" } as never,
        setWorkspaces,
      },
    );
    // The core regression guard: re-running ingest over an already-existing
    // document must never reset an admin's chosen workspace assignment.
    expect(setWorkspaces).not.toHaveBeenCalled();
    // But the document must still be (re-)processed normally.
    expect(result.status).toBe("ready");
    expect(upsertChunks).toHaveBeenCalledOnce();
    expect(setStatus).toHaveBeenLastCalledWith("doc-existing", "ready");
  });

  it("stores each chunk's position in the document, not its position among the fresh ones", async () => {
    const upserted: ChunkInput[] = [];
    const vectorStore = {
      // The first and third chunks are already stored, so `fresh` is [b, d] —
      // whose array indices (0,1) are NOT the document positions (1,3).
      existingHashes: vi.fn(async () => new Set([hashContent("a"), hashContent("c")])),
      upsertChunks: vi.fn(async (rows: ChunkInput[]) => { upserted.push(...rows); }),
    };
    await ingestExistingDocument("doc-1", { filename: "f.txt", data: Buffer.from("") }, {
      documentRepo: { createDocument: vi.fn(), setStatus: vi.fn(async () => {}) } as never,
      vectorStore: vectorStore as never,
      settings: {} as never,
      parse: async () => "ignored",
      chunk: () => ["a", "b", "c", "d"],
      embed: async (texts: string[]) => texts.map(() => [0.1]),
    });
    expect(upserted.map((r) => ({ content: r.content, chunkIndex: r.chunkIndex }))).toEqual([
      { content: "b", chunkIndex: 1 },
      { content: "d", chunkIndex: 3 },
    ]);
  });
});
