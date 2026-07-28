// Live integration test for the Weaviate adapter. Gated behind RUN_INTEGRATION=1
// and a reachable Weaviate (WEAVIATE_URL, default http://localhost:8080 + gRPC 50051).
//
//   docker compose up -d weaviate
//   RUN_INTEGRATION=1 WEAVIATE_URL=http://localhost:8080 npx vitest run src/lib/vectorstore/weaviate/store.integration.test.ts
//
// If the weaviate-client transport throws on Node >= 26, run under Node 20/22 LTS (nvm use 20).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createWeaviateStore } from "./store";
import { ensureWeaviateCollection } from "./init";
import { weaviateClient, WEAVIATE_COLLECTION } from "./client";
import type { ChunkInput } from "../types";

const RUN = process.env.RUN_INTEGRATION === "1";
const DIM = 768;
function oneHot(index: number): number[] {
  const v = new Array(DIM).fill(0);
  v[index] = 1;
  return v;
}
async function waitFor(cond: () => Promise<boolean>, tries = 30): Promise<void> {
  for (let i = 0; i < tries; i++) { if (await cond()) return; await new Promise((r) => setTimeout(r, 100)); }
  throw new Error("waitFor: condition never became true");
}

describe.runIf(RUN)("Weaviate adapter (live)", () => {
  const docId = "doc-it-1";
  const store = createWeaviateStore();

  beforeAll(async () => {
    const c = await weaviateClient();
    try { await c.collections.delete(WEAVIATE_COLLECTION); } catch { /* absent */ }
    await ensureWeaviateCollection();
  });
  afterAll(async () => {
    const c = await weaviateClient();
    try { await c.collections.delete(WEAVIATE_COLLECTION); } catch { /* best effort */ }
  });

  it("upsert -> existingHashes -> searchVector -> searchKeyword -> deleteByDocument", async () => {
    const rows: ChunkInput[] = [
      { documentId: docId, filename: "alpha.md", content: "the quick brown fox jumps", embedding: oneHot(0), contentHash: "h-alpha", chunkIndex: 0 },
      { documentId: docId, filename: "alpha.md", content: "a lazy dog sleeps peacefully", embedding: oneHot(1), contentHash: "h-beta", chunkIndex: 1 },
    ];
    await store.upsertChunks(rows);

    await waitFor(async () => (await store.existingHashes(docId)).size === 2);
    expect([...(await store.existingHashes(docId))].sort()).toEqual(["h-alpha", "h-beta"]);

    const byVector = await store.searchVector(oneHot(0), 5);
    expect(byVector[0].content).toContain("quick brown fox");
    expect(byVector[0].score).toBeGreaterThan(0.9);

    const byKeyword = await store.searchKeyword("dog", oneHot(0), 5);
    expect(byKeyword.some((c) => c.content.includes("lazy dog"))).toBe(true);

    await store.deleteByDocument(docId);
    await waitFor(async () => (await store.existingHashes(docId)).size === 0);
    expect((await store.existingHashes(docId)).size).toBe(0);
  }, 30000);

  // This is the assertion the whole task exists for: before deterministic ids,
  // upsertChunks called insertMany with no id, so Weaviate assigned a fresh
  // UUID per row and re-ingesting the SAME chunks doubled the object count
  // instead of overwriting. With ids derived from (documentId, contentHash),
  // a second ingest of unchanged content must land on the same objects.
  it("re-ingesting the same document does not duplicate its chunks", async () => {
    const reingestDocId = "doc-it-reingest";
    const rows: ChunkInput[] = [
      { documentId: reingestDocId, filename: "gamma.md", content: "first chunk of gamma", embedding: oneHot(2), contentHash: "h-gamma", chunkIndex: 0 },
      { documentId: reingestDocId, filename: "gamma.md", content: "second chunk of gamma", embedding: oneHot(3), contentHash: "h-delta", chunkIndex: 1 },
    ];

    await store.upsertChunks(rows);
    await waitFor(async () => (await store.listChunks(reingestDocId, { limit: 1, offset: 0 })).total === rows.length);
    const countAfterFirstIngest = (await store.listChunks(reingestDocId, { limit: 1, offset: 0 })).total;
    expect(countAfterFirstIngest).toBe(rows.length);

    await store.upsertChunks(rows); // re-ingest: identical documentId + contentHash per row
    await new Promise((r) => setTimeout(r, 300)); // let the second batch settle before counting
    const countAfterReingest = (await store.listChunks(reingestDocId, { limit: 1, offset: 0 })).total;
    expect(countAfterReingest).toBe(countAfterFirstIngest);

    await store.deleteByDocument(reingestDocId);
    await waitFor(async () => (await store.existingHashes(reingestDocId)).size === 0);
  }, 30000);
});
