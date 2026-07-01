import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getVectorStore, getDocumentRepo, resetVectorStoreForTests } from "./index";

const orig = process.env.VECTOR_STORE;
beforeEach(() => resetVectorStoreForTests());
afterEach(() => { process.env.VECTOR_STORE = orig; resetVectorStoreForTests(); });

describe("vector store selection", () => {
  it("defaults to pgvector when VECTOR_STORE is unset", () => {
    delete process.env.VECTOR_STORE;
    expect(getVectorStore()).toBeDefined();
  });

  it("returns pgvector explicitly", () => {
    process.env.VECTOR_STORE = "pgvector";
    const a = getVectorStore();
    const b = getVectorStore();
    expect(a).toBe(b); // memoized singleton
  });

  it("throws a clear error for an unknown store", () => {
    process.env.VECTOR_STORE = "pinecone";
    expect(() => getVectorStore()).toThrow(/unknown VECTOR_STORE/i);
  });

  it("getDocumentRepo returns a memoized repo", () => {
    expect(getDocumentRepo()).toBe(getDocumentRepo());
  });
});
