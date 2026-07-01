import { describe, it, expect, vi } from "vitest";
import { listDocuments, deleteDocument } from "@/lib/documents/service";

describe("listDocuments", () => {
  it("returns documents ordered", async () => {
    const rows = [{ id: "d1", filename: "a.md", status: "ready", createdAt: new Date(0) }];
    const db = { select: () => ({ from: () => ({ orderBy: async () => rows }) }) } as any;
    expect(await listDocuments(db)).toEqual(rows);
  });
});

describe("deleteDocument", () => {
  it("true when a row was deleted, and clears vectors first", async () => {
    const database = { delete: () => ({ where: () => ({ returning: async () => [{ id: "d1" }] }) }) } as any;
    const vectorStore = { deleteByDocument: vi.fn(async () => {}) } as any;
    expect(await deleteDocument("d1", { database, vectorStore })).toBe(true);
    expect(vectorStore.deleteByDocument).toHaveBeenCalledWith("d1");
  });
  it("false when nothing deleted", async () => {
    const database = { delete: () => ({ where: () => ({ returning: async () => [] }) }) } as any;
    const vectorStore = { deleteByDocument: vi.fn(async () => {}) } as any;
    expect(await deleteDocument("d1", { database, vectorStore })).toBe(false);
  });
});
