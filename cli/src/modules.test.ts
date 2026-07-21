import { describe, it, expect } from "vitest";
import { PROVIDERS, VECTOR_STORES, providerDepsToRemove, API_ONLY_REMOVE_DEPS, FULL_APP_REMOVE_DEPS } from "./modules.js";

describe("PROVIDERS manifest", () => {
  it("marks anthropic as not embedding-capable and the rest capable", () => {
    expect(PROVIDERS.anthropic.supportsEmbedding).toBe(false);
    expect(PROVIDERS.google.supportsEmbedding).toBe(true);
    expect(PROVIDERS.openai.supportsEmbedding).toBe(true);
    expect(PROVIDERS.ollama.supportsEmbedding).toBe(true);
  });
  it("gives ollama no dep of its own (it reuses @ai-sdk/openai)", () => {
    expect(PROVIDERS.ollama.dep).toBeNull();
    expect(PROVIDERS.openai.dep).toBe("@ai-sdk/openai");
  });
  it("anthropic has no embedding model", () => {
    expect(PROVIDERS.anthropic.defaultEmbeddingModel).toBeNull();
  });
});

describe("providerDepsToRemove", () => {
  it("keeps @ai-sdk/openai when ollama is kept but openai is removed", () => {
    const removed = providerDepsToRemove(["google", "ollama"]);
    expect(removed).toContain("@ai-sdk/anthropic");
    expect(removed).not.toContain("@ai-sdk/openai"); // ollama still needs it
  });
  it("removes @ai-sdk/openai when neither openai nor ollama is kept", () => {
    const removed = providerDepsToRemove(["google"]);
    expect(removed).toContain("@ai-sdk/openai");
    expect(removed).toContain("@ai-sdk/anthropic");
    expect(removed).not.toContain("@ai-sdk/google");
  });
});

describe("VECTOR_STORES manifest", () => {
  it("pgvector has no unique deps/docker service and needs no init", () => {
    expect(VECTOR_STORES.pgvector.deps).toEqual([]);
    expect(VECTOR_STORES.pgvector.dockerService).toBeNull();
    expect(VECTOR_STORES.pgvector.initNeeded).toBe(false);
  });
  it("pinecone is managed (no docker service) and needs init", () => {
    expect(VECTOR_STORES.pinecone.dockerService).toBeNull();
    expect(VECTOR_STORES.pinecone.initNeeded).toBe(true);
    expect(VECTOR_STORES.pinecone.deps).toContain("@pinecone-database/pinecone");
  });
  it("qdrant has a docker service + volume and needs init", () => {
    expect(VECTOR_STORES.qdrant.dockerService).toBe("qdrant");
    expect(VECTOR_STORES.qdrant.dockerVolume).toBe("rag_qdrant");
    expect(VECTOR_STORES.qdrant.initNeeded).toBe(true);
  });
});

describe("API_ONLY_REMOVE_DEPS", () => {
  it("lists the Next.js/React/UI deps, not @auth/core or the Hono deps", () => {
    for (const d of [
      "next", "react", "react-dom", "next-auth", "next-themes", "@ai-sdk/react", "@headlessui/react", "lucide-react",
      "tailwindcss", "postcss", "autoprefixer", "react-markdown", "highlight.js", "@scalar/api-reference-react",
    ]) {
      expect(API_ONLY_REMOVE_DEPS).toContain(d);
    }
    expect(API_ONLY_REMOVE_DEPS).not.toContain("@auth/core");
    expect(API_ONLY_REMOVE_DEPS).not.toContain("hono");
    expect(API_ONLY_REMOVE_DEPS).not.toContain("@scalar/hono-api-reference"); // the api build's own /docs page needs this one
  });
});

describe("FULL_APP_REMOVE_DEPS", () => {
  it("lists only the standalone-server deps, not @auth/core", () => {
    expect(FULL_APP_REMOVE_DEPS).toEqual(["hono", "@hono/node-server", "@scalar/hono-api-reference"]);
    expect(FULL_APP_REMOVE_DEPS).not.toContain("@auth/core");
  });
});
