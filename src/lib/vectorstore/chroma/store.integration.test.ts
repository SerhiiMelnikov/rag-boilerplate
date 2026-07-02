// Live integration test for the Chroma adapter. Gated behind RUN_INTEGRATION=1
// and a reachable Chroma (CHROMA_URL, default http://localhost:8000).
//
//   docker compose up -d chroma
//   RUN_INTEGRATION=1 CHROMA_URL=http://localhost:8000 npx vitest run src/lib/vectorstore/chroma/store.integration.test.ts
//
// If the chromadb client's transport throws on Node >= 26, run under Node 20/22 LTS (nvm use 20).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ChromaClient } from "chromadb";
import { createChromaStore } from "./store";
import type { ChunkInput } from "../types";

const RUN = process.env.RUN_INTEGRATION === "1";
const URL = process.env.CHROMA_URL || "http://localhost:8000";
const COLLECTION = "rag_chunks_it"; // throwaway

const DIM = 768;
function oneHot(index: number): number[] {
  const v = new Array(DIM).fill(0);
  v[index] = 1;
  return v;
}

describe.runIf(RUN)("Chroma adapter (live)", () => {
  const client = new ChromaClient({ path: URL });
  const docId = "doc-it-1";
  const getCollection = async () =>
    client.getOrCreateCollection({
      name: COLLECTION,
      metadata: { "hnsw:space": "cosine" },
      embeddingFunction: { generate: async () => { throw new Error("no ef"); } } as never,
    });
  const store = createChromaStore(getCollection as never);

  beforeAll(async () => { try { await client.deleteCollection({ name: COLLECTION }); } catch { /* absent */ } });
  afterAll(async () => { try { await client.deleteCollection({ name: COLLECTION }); } catch { /* best effort */ } });

  it("upsert -> existingHashes -> searchVector -> searchKeyword -> deleteByDocument", async () => {
    const rows: ChunkInput[] = [
      { documentId: docId, filename: "alpha.md", content: "the quick brown fox jumps", embedding: oneHot(0), contentHash: "h-alpha" },
      { documentId: docId, filename: "alpha.md", content: "a lazy dog sleeps peacefully", embedding: oneHot(1), contentHash: "h-beta" },
    ];
    await store.upsertChunks(rows);

    expect([...(await store.existingHashes(docId))].sort()).toEqual(["h-alpha", "h-beta"]);

    const byVector = await store.searchVector(oneHot(0), 5);
    expect(byVector[0].content).toContain("quick brown fox");
    expect(byVector[0].documentId).toBe(docId);
    expect(byVector[0].score).toBeGreaterThan(0.9);

    const byKeyword = await store.searchKeyword("dog", oneHot(0), 5);
    expect(byKeyword.some((c) => c.content.includes("lazy dog"))).toBe(true);

    await store.deleteByDocument(docId);
    expect((await store.existingHashes(docId)).size).toBe(0);
  }, 30000);
});
