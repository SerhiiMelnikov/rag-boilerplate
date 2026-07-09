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

import { workspaces, documentWorkspaces, imageWorkspaces, userWorkspaces } from "./schema";

describe("workspaces schema", () => {
  it("exports the workspace tables", () => {
    for (const t of ["workspaces", "documentWorkspaces", "imageWorkspaces", "userWorkspaces"]) {
      expect(schema).toHaveProperty(t);
    }
  });

  it("workspaces table has name, description, is_default", () => {
    const cols = Object.keys(workspaces);
    expect(cols).toEqual(expect.arrayContaining(["id", "name", "description", "isDefault", "createdAt"]));
  });

  it("join tables key an entity to a workspace", () => {
    expect(Object.keys(documentWorkspaces)).toEqual(expect.arrayContaining(["documentId", "workspaceId"]));
    expect(Object.keys(imageWorkspaces)).toEqual(expect.arrayContaining(["imageId", "workspaceId"]));
    expect(Object.keys(userWorkspaces)).toEqual(expect.arrayContaining(["userId", "workspaceId"]));
  });

  it("messages carry an optional workspace_id", () => {
    expect(Object.keys(schema.messages)).toEqual(expect.arrayContaining(["workspaceId"]));
  });
});
