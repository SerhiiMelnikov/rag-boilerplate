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
      { documentId: docId, filename: "alpha.md", content: "the quick brown fox jumps", embedding: oneHot(0), contentHash: "h-alpha" },
      { documentId: docId, filename: "alpha.md", content: "a lazy dog sleeps peacefully", embedding: oneHot(1), contentHash: "h-beta" },
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
});
