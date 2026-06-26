import { describe, it, expect } from "vitest";
import * as schema from "@/lib/db/schema";

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
