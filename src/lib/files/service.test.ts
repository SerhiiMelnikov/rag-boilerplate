import { describe, it, expect } from "vitest";
import { listFiles, extOf } from "./service";
import { documents, images } from "@/lib/db/schema";

describe("extOf", () => {
  it("returns the lowercased extension without a dot", () => {
    expect(extOf("Report.PDF")).toBe("pdf");
    expect(extOf("photo.jpeg")).toBe("jpeg");
    expect(extOf("noext")).toBe("");
    expect(extOf("trailing.")).toBe("");
  });
});

describe("listFiles", () => {
  it("merges documents + images into FileRows, newest first, caption null for docs", async () => {
    const db = {
      select: () => ({
        from: (table: unknown) =>
          table === documents
            ? Promise.resolve([{ id: "d1", filename: "a.PDF", status: "ready", error: null, createdAt: new Date("2026-01-02") }])
            : Promise.resolve([{ id: "i1", filename: "b.png", status: "processing", error: null, caption: "a cat", createdAt: new Date("2026-01-01") }]),
      }),
    };
    const rows = await listFiles(db as never);
    expect(rows.map((r) => r.kind)).toEqual(["document", "image"]); // d1 (Jan 2) before i1 (Jan 1)
    expect(rows[0]).toMatchObject({ id: "d1", kind: "document", ext: "pdf", caption: null, status: "ready" });
    expect(rows[1]).toMatchObject({ id: "i1", kind: "image", ext: "png", caption: "a cat", status: "processing" });
  });
});
