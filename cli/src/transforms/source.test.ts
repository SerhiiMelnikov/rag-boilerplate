import { describe, it, expect, beforeEach } from "vitest";
import { Project } from "ts-morph";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pruneProviderFactory, narrowProviderUnions, pruneVectorFactory, pruneVectorInitScript, pruneAdminProviderLists, rewriteSettingsDefaults } from "./source";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "test-fixtures");
const read = (p: string) => readFileSync(join(FIX, p), "utf8");

// Load a fixture into an in-memory ts-morph project under a virtual path that
// matches what each transform looks up.
function projectWith(virtualPath: string, source: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(virtualPath, source);
  return project;
}

describe("pruneProviderFactory", () => {
  it("removes the anthropic import and its switch cases", () => {
    const project = projectWith("src/lib/providers/index.ts", read("providers-index.ts"));
    pruneProviderFactory(project, ["anthropic"]);
    const text = project.getSourceFileOrThrow("src/lib/providers/index.ts").getFullText();
    expect(text).not.toContain("anthropicChat");
    expect(text).not.toContain('case "anthropic"');
    expect(text).toContain('case "google"');
    expect(text).toContain('case "ollama"');
  });
});

describe("narrowProviderUnions", () => {
  it("narrows ProviderId and EmbeddingProviderId to the kept set", () => {
    const project = projectWith("src/lib/providers/types.ts", read("providers-types.ts"));
    narrowProviderUnions(project, ["google", "ollama"]);
    const text = project.getSourceFileOrThrow("src/lib/providers/types.ts").getFullText();
    expect(text).toContain('export type ProviderId = "google" | "ollama";');
    expect(text).toContain('export type EmbeddingProviderId = "google" | "ollama";');
    expect(text).not.toContain("anthropic");
    expect(text).not.toContain("openai");
  });
});

describe("pruneVectorFactory", () => {
  it("removes pruned store imports and cases", () => {
    const project = projectWith("src/lib/vectorstore/index.ts", read("vectorstore-index.ts"));
    pruneVectorFactory(project, ["chroma", "weaviate", "pinecone"]);
    const text = project.getSourceFileOrThrow("src/lib/vectorstore/index.ts").getFullText();
    expect(text).not.toContain("createChromaStore");
    expect(text).not.toContain('case "weaviate"');
    expect(text).toContain('case "pgvector"');
    expect(text).toContain('case "qdrant"');
  });
});

describe("pruneVectorInitScript", () => {
  it("removes pruned stores' ensure* imports and switch cases", () => {
    const project = projectWith("scripts/vectorstore-init.ts", read("vectorstore-init.ts"));
    pruneVectorInitScript(project, ["chroma", "weaviate", "pinecone"]);
    const text = project.getSourceFileOrThrow("scripts/vectorstore-init.ts").getFullText();
    expect(text).not.toContain("ensureChromaCollection");
    expect(text).not.toContain("ensureWeaviateCollection");
    expect(text).not.toContain("ensurePineconeIndexes");
    expect(text).not.toContain('case "chroma"');
    expect(text).not.toContain('case "weaviate"');
    expect(text).not.toContain('case "pinecone"');
    expect(text).toContain("ensureQdrantCollection");
    expect(text).toContain('case "qdrant"');
  });
});

describe("pruneAdminProviderLists", () => {
  it("removes pruned providers from the hardcoded arrays and key rows", () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile("src/components/admin/settings-form.tsx", read("settings-form.tsx"));
    project.createSourceFile("src/components/admin/provider-keys-form.tsx", read("provider-keys-form.tsx"));
    pruneAdminProviderLists(project, ["google", "ollama"]);
    const sf = project.getSourceFileOrThrow("src/components/admin/settings-form.tsx").getFullText();
    expect(sf).not.toContain('"anthropic"');
    expect(sf).not.toContain('"openai"');
    expect(sf).toContain('"google"');
    const kf = project.getSourceFileOrThrow("src/components/admin/provider-keys-form.tsx").getFullText();
    expect(kf).not.toMatch(/Anthropic API key/);
    expect(kf).not.toMatch(/OpenAI API key/);
    expect(kf).toMatch(/Google API key/);
  });

  it("prunes the Ollama input and dead provider refs when ollama is not kept", () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile("src/components/admin/settings-form.tsx", read("settings-form.tsx"));
    project.createSourceFile("src/components/admin/provider-keys-form.tsx", read("provider-keys-form.tsx"));
    pruneAdminProviderLists(project, ["google"]);
    const kf = project.getSourceFileOrThrow("src/components/admin/provider-keys-form.tsx").getFullText();
    expect(kf).not.toContain("Ollama base URL");
    expect(kf).not.toContain('"openai"');
    expect(kf).not.toContain('"anthropic"');
    expect(kf).toContain('type KeyName = "google"');
    expect(kf).toMatch(/Google API key/);
  });

  it("keeps the Ollama input when ollama is kept, but still narrows KeyName to key-based providers", () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile("src/components/admin/settings-form.tsx", read("settings-form.tsx"));
    project.createSourceFile("src/components/admin/provider-keys-form.tsx", read("provider-keys-form.tsx"));
    pruneAdminProviderLists(project, ["google", "ollama"]);
    const kf = project.getSourceFileOrThrow("src/components/admin/provider-keys-form.tsx").getFullText();
    expect(kf).toContain("Ollama base URL");
    expect(kf).toContain('type KeyName = "google"');
    expect(kf).not.toContain('"openai"');
    expect(kf).not.toContain('"anthropic"');
  });
});

describe("rewriteSettingsDefaults", () => {
  it("rewrites the six provider/model defaults", () => {
    const project = projectWith("src/lib/db/schema.ts", read("schema.ts"));
    rewriteSettingsDefaults(project, {
      chatProvider: "openai", chatModel: "gpt-4o-mini",
      embeddingProvider: "openai", embeddingModel: "text-embedding-3-small",
      parserProvider: "openai", parserModel: "gpt-4o-mini",
    });
    const text = project.getSourceFileOrThrow("src/lib/db/schema.ts").getFullText();
    expect(text).toContain('.default("openai")');
    expect(text).toContain('.default("gpt-4o-mini")');
    expect(text).toContain('.default("text-embedding-3-small")');
    expect(text).not.toContain('.default("google")');
    expect(text).not.toContain('.default("gemma-4-31b-it")');
  });
});
