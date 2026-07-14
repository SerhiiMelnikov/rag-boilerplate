import { describe, it, expect, vi } from "vitest";
import { listDocuments, deleteDocument } from "@/lib/documents/service";

describe("listDocuments", () => {
  it("returns documents ordered", async () => {
    const rows = [{ id: "d1", filename: "a.md", status: "ready", createdAt: new Date(0) }];
    const db = { select: () => ({ from: () => ({ orderBy: async () => rows }) }) } as never;
    expect(await listDocuments(db)).toEqual(rows);
  });
});

describe("deleteDocument", () => {
  it("true when a row was deleted, and clears vectors first", async () => {
    const database = { delete: () => ({ where: () => ({ returning: async () => [{ id: "d1" }] }) }) };
    const vectorStore = { deleteByDocument: vi.fn(async () => {}) };
    // Deliberate: casting the whole deps bag (not `vectorStore` itself) keeps
    // `vectorStore` fully typed below, where we assert on the spy directly.
    expect(await deleteDocument("d1", { database, vectorStore } as never)).toBe(true);
    expect(vectorStore.deleteByDocument).toHaveBeenCalledWith("d1");
  });
  it("false when nothing deleted", async () => {
    const database = { delete: () => ({ where: () => ({ returning: async () => [] }) }) };
    const vectorStore = { deleteByDocument: vi.fn(async () => {}) };
    expect(await deleteDocument("d1", { database, vectorStore } as never)).toBe(false);
  });
});
