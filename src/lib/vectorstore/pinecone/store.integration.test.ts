// Live integration test for the Pinecone adapter (sparse-dense). Gated behind
// RUN_INTEGRATION=1 AND PINECONE_API_KEY (managed service — no docker).
//
//   RUN_INTEGRATION=1 PINECONE_API_KEY=... npx vitest run src/lib/vectorstore/pinecone/store.integration.test.ts
//
// Uses the configured indexes (PINECONE_DENSE_INDEX / PINECONE_SPARSE_INDEX);
// create them first with `npm run vectorstore:init`. If the client transport
// throws on Node >= 26, run under Node 20/22 LTS (nvm use 20).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPineconeStore } from "./store";
import { ensurePineconeIndexes } from "./init";
import type { ChunkInput } from "../types";

const RUN = process.env.RUN_INTEGRATION === "1" && !!process.env.PINECONE_API_KEY;
const DIM = 768;
function oneHot(index: number): number[] {
  const v = new Array(DIM).fill(0);
  v[index] = 1;
  return v;
}
// Pinecone serverless is eventually consistent; poll until writes are visible.
async function waitFor(cond: () => Promise<boolean>, tries = 60): Promise<void> {
  for (let i = 0; i < tries; i++) { if (await cond()) return; await new Promise((r) => setTimeout(r, 1000)); }
  throw new Error("waitFor: condition never became true");
}

describe.runIf(RUN)("Pinecone adapter (live)", () => {
  const store = createPineconeStore();
  const docId = `doc-it-${DIM}`; // stable per-run doc id; cleaned up in afterAll

  beforeAll(async () => { await ensurePineconeIndexes(); await store.deleteByDocument(docId); });
  afterAll(async () => { await store.deleteByDocument(docId); });

  it("upsert -> existingHashes -> searchVector -> searchKeyword -> deleteByDocument", async () => {
    const rows: ChunkInput[] = [
      { documentId: docId, filename: "alpha.md", content: "the quick brown fox jumps", embedding: oneHot(0), contentHash: "h-alpha" },
      { documentId: docId, filename: "alpha.md", content: "a lazy dog sleeps peacefully", embedding: oneHot(1), contentHash: "h-beta" },
    ];
    await store.upsertChunks(rows);

    await waitFor(async () => (await store.existingHashes(docId)).size === 2);
    expect([...(await store.existingHashes(docId))].sort()).toEqual(["h-alpha", "h-beta"]);

    // Serverless query freshness lags behind the list/fetch used by existingHashes,
    // so poll the query itself until the just-written vectors are searchable rather
    // than asserting on the first (possibly stale) response.
    let byVector = await store.searchVector(oneHot(0), 5);
    await waitFor(async () => {
      byVector = await store.searchVector(oneHot(0), 5);
      return byVector[0]?.content?.includes("quick brown fox") ?? false;
    });
    expect(byVector[0].score).toBeGreaterThan(0.9);

    let byKeyword = await store.searchKeyword("dog", oneHot(0), 5);
    await waitFor(async () => {
      byKeyword = await store.searchKeyword("dog", oneHot(0), 5);
      return byKeyword.some((c) => c.content.includes("lazy dog"));
    });
    expect(byKeyword.some((c) => c.content.includes("lazy dog"))).toBe(true);

    await store.deleteByDocument(docId);
    await waitFor(async () => (await store.existingHashes(docId)).size === 0);
    expect((await store.existingHashes(docId)).size).toBe(0);
  }, 120000);
});
