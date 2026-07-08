import { describe, it, expect } from "vitest";
import * as schema from "@/lib/db/schema";
import { images, imageVectors } from "./schema";

describe("schema", () => {
  it("exports all required tables", () => {
    for (const t of ["users", "documents", "chunks", "conversations", "messages", "settings"]) {
      expect(schema).toHaveProperty(t);
    }
  });

  it("fixes embedding dimension to 768", () => {
    expect(schema.EMBEDDING_DIMENSIONS).toBe(768);
  });
});

describe("images schema", () => {
  it("images table exposes the metadata columns (no embedding column)", () => {
    const cols = Object.keys(images);
    expect(cols).toEqual(expect.arrayContaining(["id", "filename", "storageKey", "contentType", "caption", "status", "error", "uploadedBy", "createdAt"]));
    expect(cols).not.toContain("embedding");
  });

  it("imageVectors table carries the pgvector embedding keyed by imageId", () => {
    const cols = Object.keys(imageVectors);
    expect(cols).toEqual(expect.arrayContaining(["imageId", "embedding"]));
  });
});
