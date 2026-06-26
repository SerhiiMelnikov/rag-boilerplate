import { describe, it, expect } from "vitest";
import { listDocuments, deleteDocument } from "@/lib/documents/service";

describe("listDocuments", () => {
  it("returns documents ordered", async () => {
    const rows = [{ id: "d1", filename: "a.md", status: "ready", createdAt: new Date(0) }];
    const db = { select: () => ({ from: () => ({ orderBy: async () => rows }) }) } as any;
    expect(await listDocuments(db)).toEqual(rows);
  });
});

describe("deleteDocument", () => {
  it("true when a row was deleted", async () => {
    const db = { delete: () => ({ where: () => ({ returning: async () => [{ id: "d1" }] }) }) } as any;
    expect(await deleteDocument("d1", db)).toBe(true);
  });
  it("false when nothing deleted", async () => {
    const db = { delete: () => ({ where: () => ({ returning: async () => [] }) }) } as any;
    expect(await deleteDocument("d1", db)).toBe(false);
  });
});
