import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { ingestDocument } from "@/lib/rag/ingest";
import { getDocumentRepo, getVectorStore } from "@/lib/vectorstore";
import { createWorkspaceRepo } from "@/lib/workspaces/repo";
import type { RuntimeSettings } from "@/lib/config/settings-service";

const PREFIX = "__itest_upload__";

// Unused at runtime (embed is injected via fakeEmbed below) but required to
// satisfy IngestDeps' type.
const settings = {
  chatProvider: "google", chatModel: "gemma-4-31b-it",
  embeddingProvider: "google", embeddingModel: "gemini-embedding-2",
  parserProvider: "google", parserModel: "gemini-2.5-flash",
  imageProvider: "google", imageModel: "gemini-2.5-flash",
  unifiedMode: false, unifiedProvider: "google", unifiedModel: "gemma-4-31b-it",
  temperature: 0.2, topK: 5, minSimilarity: 0.3, contextTokenBudget: 3000,
  systemPrompt: "sp", ollamaBaseUrl: "http://localhost:11434",
  chatRateLimitPerMinute: 20, chatRateLimitPerDay: 200,
  registrationMode: "verified", allowedEmailDomains: "",
  smtpHost: "", smtpPort: 587, smtpUser: "", smtpFrom: "",
  keys: { google: "gk", openai: null, anthropic: null },
  smtpPassword: null,
} satisfies RuntimeSettings;

describe.runIf(process.env.RUN_INTEGRATION === "1")("admin document upload (real DB)", () => {
  afterAll(async () => {
    // Clean up any rows created by this suite.
    const rows = await db.select({ id: documents.id, filename: documents.filename }).from(documents);
    for (const r of rows) {
      if (r.filename.startsWith(PREFIX)) await db.delete(documents).where(eq(documents.id, r.id));
    }
  });

  it("ingests via the real store with an injected embedder and is re-upload safe", async () => {
    const filename = `${PREFIX}doc.md`;
    const fakeEmbed = async (texts: string[]) => texts.map(() => Array(768).fill(0.02));
    const workspaceRepo = createWorkspaceRepo();
    const first = await ingestDocument(
      { filename, data: Buffer.from("Hello world. This is a test document about scattering.") },
      { documentRepo: getDocumentRepo(), vectorStore: getVectorStore(), embed: fakeEmbed, settings, workspaceRepo },
    );
    expect(first.status).toBe("ready");
    expect(first.chunkCount).toBeGreaterThan(0);

    const second = await ingestDocument(
      { filename, data: Buffer.from("Hello world. This is a test document about scattering.") },
      { documentRepo: getDocumentRepo(), vectorStore: getVectorStore(), embed: fakeEmbed, settings, workspaceRepo },
    );
    expect(second.chunkCount).toBe(0);
    expect(second.skipped).toBe(first.chunkCount);

    const rows = await db.select({ id: documents.id }).from(documents).where(eq(documents.filename, filename));
    expect(rows).toHaveLength(1);
  });
});
