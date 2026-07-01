// Live integration test for the Qdrant adapter. Gated behind RUN_INTEGRATION=1
// and a reachable Qdrant (QDRANT_URL, default http://localhost:6333). It exercises
// the full VectorStore contract against a real server using a throwaway collection.
//
//   docker compose up -d qdrant
//   RUN_INTEGRATION=1 npx vitest run src/lib/vectorstore/qdrant/store.integration.test.ts
//
// Note: the @qdrant/js-client-rest transport (bundled undici 6.x) is incompatible
// with Node >= 26 (throws "invalid onError method"). Run this under Node 20/22 LTS.
// The adapter's operations were additionally verified directly against a live
// Qdrant 1.18 via the REST API (create/index/upsert/query/MatchText/scroll/delete).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { QdrantClient } from "@qdrant/js-client-rest";
import { createQdrantStore } from "./store";
import { ensureQdrantCollection } from "./init";
import type { ChunkInput } from "../types";

const RUN = process.env.RUN_INTEGRATION === "1";
const URL = process.env.QDRANT_URL || "http://localhost:6333";
const COLLECTION = "rag_chunks_it"; // throwaway; created and dropped by this test

const DIM = 768;
// A one-hot 768-vector, so cosine similarity is 1.0 for the matching axis and
// 0 for any other — deterministic nearest-neighbour behaviour.
function oneHot(index: number): number[] {
  const v = new Array(DIM).fill(0);
  v[index] = 1;
  return v;
}

// Qdrant applies writes with wait:true, but poll defensively so the test is not
// flaky on a slow box.
async function waitFor(cond: () => Promise<boolean>, tries = 30): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("waitFor: condition never became true");
}

describe.runIf(RUN)("Qdrant adapter (live)", () => {
  const client = new QdrantClient({ url: URL });
  const store = createQdrantStore(client, COLLECTION);
  const docId = "doc-it-1";

  beforeAll(async () => {
    try { await client.deleteCollection(COLLECTION); } catch { /* first run: absent */ }
    await ensureQdrantCollection(client, COLLECTION);
  });
  afterAll(async () => {
    try { await client.deleteCollection(COLLECTION); } catch { /* best effort */ }
  });

  it("upsert -> existingHashes -> searchVector -> searchKeyword -> deleteByDocument", async () => {
    const rows: ChunkInput[] = [
      { documentId: docId, filename: "alpha.md", content: "the quick brown fox jumps", embedding: oneHot(0), contentHash: "h-alpha" },
      { documentId: docId, filename: "alpha.md", content: "a lazy dog sleeps peacefully", embedding: oneHot(1), contentHash: "h-beta" },
    ];
    await store.upsertChunks(rows);

    // existingHashes reflects both chunks (dedupe key for re-ingest).
    await waitFor(async () => (await store.existingHashes(docId)).size === 2);
    expect([...(await store.existingHashes(docId))].sort()).toEqual(["h-alpha", "h-beta"]);

    // Vector search: querying near axis 0 returns the fox chunk first, and the
    // score is a cosine SIMILARITY (~1.0), not a distance — this is what fuse()'s
    // minSimilarity gate relies on.
    const byVector = await store.searchVector(oneHot(0), 5);
    expect(byVector.length).toBeGreaterThan(0);
    expect(byVector[0].content).toContain("quick brown fox");
    expect(byVector[0].filename).toBe("alpha.md");
    expect(byVector[0].documentId).toBe(docId);
    expect(byVector[0].score).toBeGreaterThan(0.9);

    // Keyword (MatchText) search finds by term regardless of vector proximity —
    // proves the full-text payload index created at init works.
    const byKeyword = await store.searchKeyword("dog", oneHot(0), 5);
    expect(byKeyword.some((c) => c.content.includes("lazy dog"))).toBe(true);

    // Delete removes the document's points (essential under Qdrant — no FK cascade).
    await store.deleteByDocument(docId);
    await waitFor(async () => (await store.existingHashes(docId)).size === 0);
    expect((await store.existingHashes(docId)).size).toBe(0);
  }, 30000);
});
