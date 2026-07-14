import { describe, it, expect, vi } from "vitest";
import { listDocuments, deleteDocument } from "@/lib/documents/service";
import type { db } from "@/lib/db/client";
import type { VectorStore } from "@/lib/vectorstore/types";

describe("listDocuments", () => {
  it("returns documents ordered", async () => {
    const rows = [{ id: "d1", filename: "a.md", status: "ready", createdAt: new Date(0) }];
    const fakeDb = { select: () => ({ from: () => ({ orderBy: async () => rows }) }) };
    expect(await listDocuments(fakeDb as unknown as typeof db)).toEqual(rows);
  });
});

describe("deleteDocument", () => {
  it("true when a row was deleted, and clears vectors first", async () => {
    const database = { delete: () => ({ where: () => ({ returning: async () => [{ id: "d1" }] }) }) };
    const vectorStore = { deleteByDocument: vi.fn(async () => {}) };
    // Deliberate: casting each dep value (not the deps bag itself) keeps the
    // object literal's keys checked against deleteDocument's deps type, so a
    // typo'd key (e.g. `vectorstore`) still fails to compile. `vectorStore`
    // itself stays fully typed below, where we assert on the spy directly.
    expect(
      await deleteDocument("d1", {
        database: database as unknown as typeof db,
        vectorStore: vectorStore as unknown as VectorStore,
      }),
    ).toBe(true);
    expect(vectorStore.deleteByDocument).toHaveBeenCalledWith("d1");
  });
  it("false when nothing deleted", async () => {
    const database = { delete: () => ({ where: () => ({ returning: async () => [] }) }) };
    const vectorStore = { deleteByDocument: vi.fn(async () => {}) };
    expect(
      await deleteDocument("d1", {
        database: database as unknown as typeof db,
        vectorStore: vectorStore as unknown as VectorStore,
      }),
    ).toBe(false);
  });
});
