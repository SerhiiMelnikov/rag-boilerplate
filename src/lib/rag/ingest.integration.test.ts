/**
 * Integration tests for ingestDocument against a real Postgres+pgvector DB.
 *
 * Gated: only runs when RUN_INTEGRATION=1 is set so the normal `npm test`
 * (no DB) stays green and skips this suite entirely.
 *
 * Requires DATABASE_URL pointing at the real DB (e.g. postgres://rag:rag@localhost:5432/rag).
 * No Gemini API key needed — a fake embedder returning a fixed 768-dim vector is injected.
 *
 * Run via: DATABASE_URL=postgres://rag:rag@localhost:5432/rag npm run test:integration
 */

import { describe, it, expect, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { documents, chunks } from "@/lib/db/schema";
import { ingestDocument } from "./ingest";
import { searchChunks } from "./retrieve";
import { createDocumentRepo } from "@/lib/vectorstore/document-repo";
import { createPgVectorStore } from "@/lib/vectorstore/pgvector/store";
import type { RuntimeSettings } from "@/lib/config/settings-service";

// Unused at runtime (embed is injected via fakeEmbedder below) but required to
// satisfy IngestDeps' type.
const settings = {
  chatProvider: "google", chatModel: "gemma-4-31b-it",
  embeddingProvider: "google", embeddingModel: "gemini-embedding-2",
  parserProvider: "google", parserModel: "gemini-2.5-flash",
  imageProvider: "google", imageModel: "gemini-2.5-flash",
  unifiedMode: false, unifiedProvider: "google", unifiedModel: "gemma-4-31b-it",
  temperature: 0.2, topK: 5, minSimilarity: 0.3, contextTokenBudget: 3000,
  systemPrompt: "sp", ollamaBaseUrl: "http://localhost:11434",
  keys: { google: "gk", openai: null, anthropic: null },
} satisfies RuntimeSettings;

// Fixed 768-dimension vector used for all fake embeddings so cosine similarity
// between any two embedded texts is 1 (identical vectors).
const FAKE_VECTOR = Array<number>(768).fill(0.01);

// Fake embedder: ignores input text, returns the fixed vector for each item.
const fakeEmbedder = async (texts: string[]): Promise<number[][]> =>
  texts.map(() => [...FAKE_VECTOR]);

// Distinctive prefix so afterAll cleanup can target only test rows.
const TEST_PREFIX = "__itest__";

// Build a unique filename for this test run to avoid cross-run collisions.
const testFilename = `${TEST_PREFIX}doc_${Date.now()}.txt`;
const testContent = "Integration test content. The quick brown fox jumps over the lazy dog.";

// Connect directly to the real DATABASE_URL. The vitest config env stubs
// DATABASE_URL for unit tests, but integration tests bypass that by reading
// the value set in the process environment before vitest loads the config
// (i.e. from the CLI: DATABASE_URL=... npm run test:integration).
// We must read it from process.env at module evaluation time — before any
// import that would trigger the singleton db client to initialise.
const dbUrl = process.env.DATABASE_URL!;
const pgClient = postgres(dbUrl);
const testDb = drizzle(pgClient, { schema });

describe.runIf(process.env.RUN_INTEGRATION === "1")("ingestDocument — real DB integration", () => {
  let firstChunkCount = 0;

  afterAll(async () => {
    // Remove all documents whose filename starts with the test prefix so the
    // suite is repeatable. Cascade on chunks handles the chunk rows.
    await testDb
      .delete(documents)
      .where(sql`${documents.filename} like ${TEST_PREFIX + "%"}`);
    await pgClient.end();
  });

  it("first ingest: status ready, chunkCount > 0, skipped 0", async () => {
    // Inject testDb so the store uses the real DB connection, not the stub
    // singleton from @/lib/db/client that vitest config overwrites.
    const documentRepo = createDocumentRepo(testDb);
    const vectorStore = createPgVectorStore(testDb);
    const result = await ingestDocument(
      { filename: testFilename, data: Buffer.from(testContent, "utf-8") },
      { documentRepo, vectorStore, embed: fakeEmbedder, settings },
    );

    expect(result.status).toBe("ready");
    expect(result.chunkCount).toBeGreaterThan(0);
    expect(result.skipped).toBe(0);
    firstChunkCount = result.chunkCount;
  });

  it("re-ingest identical file: chunkCount 0, skipped == prior count, exactly one document row", async () => {
    const documentRepo = createDocumentRepo(testDb);
    const vectorStore = createPgVectorStore(testDb);
    const result = await ingestDocument(
      { filename: testFilename, data: Buffer.from(testContent, "utf-8") },
      { documentRepo, vectorStore, embed: fakeEmbedder, settings },
    );

    expect(result.status).toBe("ready");
    expect(result.chunkCount).toBe(0);
    expect(result.skipped).toBe(firstChunkCount);

    // Confirm find-or-create: only one documents row exists for this filename.
    const rows = await testDb
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.filename, testFilename));
    expect(rows).toHaveLength(1);
  });

  it("searchChunks round-trip: at least one chunk returned with fake vector query", async () => {
    // The stored chunks were embedded with FAKE_VECTOR, so querying with the
    // same vector yields cosine similarity of 1 — well above any threshold.
    // Inject a pgvector store bound to the real testDb connection.
    const store = createPgVectorStore(testDb);

    const results = await searchChunks(
      "test query",
      FAKE_VECTOR,
      { topK: 5, minSimilarity: 0.1, tokenBudget: 10000 },
      { store },
    );

    expect(results.length).toBeGreaterThan(0);
    // Verify the result belongs to our test document.
    const found = results.some((r) => r.filename === testFilename);
    expect(found).toBe(true);
  });
});
