import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { ingestDocument } from "@/lib/rag/ingest";
import { createDrizzleStore } from "@/lib/rag/store";

const PREFIX = "__itest_upload__";

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
    const first = await ingestDocument(
      { filename, data: Buffer.from("Hello world. This is a test document about scattering.") },
      { store: createDrizzleStore(), embed: fakeEmbed },
    );
    expect(first.status).toBe("ready");
    expect(first.chunkCount).toBeGreaterThan(0);

    const second = await ingestDocument(
      { filename, data: Buffer.from("Hello world. This is a test document about scattering.") },
      { store: createDrizzleStore(), embed: fakeEmbed },
    );
    expect(second.chunkCount).toBe(0);
    expect(second.skipped).toBe(first.chunkCount);

    const rows = await db.select({ id: documents.id }).from(documents).where(eq(documents.filename, filename));
    expect(rows).toHaveLength(1);
  });
});
