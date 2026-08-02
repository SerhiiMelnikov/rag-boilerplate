import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pruneProviderFactory, narrowProviderUnions, pruneVectorFactory, pruneVectorInitScript, pruneProviderCatalog, pruneOpenApiProviderLists, rewriteSettingsDefaults, pruneChunksFromSchema } from "./source.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "test-fixtures");
const read = (p: string) => readFileSync(join(FIX, p), "utf8");

// The real files, not copies. cli/test-fixtures snapshots drifted silently once
// already — settings-form.tsx sat at 130 lines against the real file's 203, so
// the transform tests were green against a shape that no longer existed. Reading
// the repository makes that impossible rather than merely discouraged. cli/ is a
// subdirectory of the repo and its tests never ship (package.json files: dist, template).
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const readRepo = (p: string) => readFileSync(join(REPO, p), "utf8");

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

describe("pruneProviderCatalog", () => {
  const CATALOG = "src/lib/providers/catalog.ts";
  const load = () => projectWith(CATALOG, readRepo(CATALOG));
  const textOf = (project: Project) => project.getSourceFileOrThrow(CATALOG).getFullText();

  it("keeps only the selected provider", () => {
    const project = load();
    pruneProviderCatalog(project, ["google"]);
    const text = textOf(project);
    expect(text).toContain('id: "google"');
    expect(text).not.toContain('id: "openai"');
    expect(text).not.toContain('id: "anthropic"');
    expect(text).not.toContain('id: "ollama"');
  });

  it("keeps two providers and drops the rest", () => {
    const project = load();
    pruneProviderCatalog(project, ["anthropic", "google"]);
    const text = textOf(project);
    expect(text).toContain('id: "google"');
    expect(text).toContain('id: "anthropic"');
    expect(text).not.toContain('id: "openai"');
    expect(text).not.toContain('id: "ollama"');
  });

  // The configuration both of the old transform's `never` guards existed for.
  // With a data array there is nothing to collapse: one element is a valid array.
  it("keeps ollama alone without needing a guard", () => {
    const project = load();
    pruneProviderCatalog(project, ["ollama"]);
    const text = textOf(project);
    expect(text).toContain('id: "ollama"');
    expect(text).toContain("keyName: null");
    expect(text).not.toContain('id: "google"');
    // KeyName is never narrowed — leaving it wide is what removes the collapse.
    expect(text).toContain('export type KeyName = "google" | "openai" | "anthropic"');
  });

  it("leaves the catalog untouched when every provider is kept", () => {
    const project = load();
    const before = textOf(project);
    pruneProviderCatalog(project, ["google", "openai", "anthropic", "ollama"]);
    expect(textOf(project)).toBe(before);
  });

  // The contract, enforced loudly. Its predecessor swept every literal in two
  // files and had no way to notice the shape it depended on had changed.
  it("throws when PROVIDERS is no longer an array literal", () => {
    const project = projectWith(CATALOG, "export const PROVIDERS = buildProviders();");
    expect(() => pruneProviderCatalog(project, ["google"])).toThrow(/array literal/);
  });

  it("throws when an entry has no string-literal id", () => {
    const project = projectWith(CATALOG, "export const PROVIDERS = [{ id: GOOGLE, label: \"Google\" }];");
    expect(() => pruneProviderCatalog(project, ["google"])).toThrow(/string literal/);
  });
});

describe("pruneOpenApiProviderLists", () => {
  it("narrows admin-settings.ts and schemas.ts to a single kept provider (google)", () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile("src/lib/openapi/paths/admin-settings.ts", read("admin-settings.ts"));
    project.createSourceFile("src/lib/openapi/schemas.ts", read("schemas.ts"));
    pruneOpenApiProviderLists(project, ["google"]);

    const as = project.getSourceFileOrThrow("src/lib/openapi/paths/admin-settings.ts").getFullText();
    expect(as).toContain('const CHAT_PROVIDERS = ["google"] as const;');
    expect(as).toContain('const EMBEDDING_PROVIDERS = ["google"] as const;');
    expect(as).not.toContain("openaiKey");
    expect(as).not.toContain("anthropicKey");
    expect(as).toContain("googleKey");
    // Unrelated object-literal properties elsewhere in the file (registerPath's
    // responses/content/security nesting) must survive untouched.
    expect(as).toContain('description: "Not signed in"');
    expect(as).toContain('security: [{ sessionCookie: [] }]');

    const sc = project.getSourceFileOrThrow("src/lib/openapi/schemas.ts").getFullText();
    expect(sc).toContain("google: KeyStatus");
    expect(sc).not.toContain("openai: KeyStatus");
    expect(sc).not.toContain("anthropic: KeyStatus");
    // The unrelated `Locale.google` field is not a KeyStatus and must survive —
    // proves the removal is scoped by initializer, not by property name alone.
    expect(sc).toContain("google: z.string()");
  });

  it("does not throw for an ollama-only selection and leaves valid (empty) zod values", () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile("src/lib/openapi/paths/admin-settings.ts", read("admin-settings.ts"));
    project.createSourceFile("src/lib/openapi/schemas.ts", read("schemas.ts"));
    expect(() => pruneOpenApiProviderLists(project, ["ollama"])).not.toThrow();

    const as = project.getSourceFileOrThrow("src/lib/openapi/paths/admin-settings.ts").getFullText();
    expect(as).toContain('const CHAT_PROVIDERS = ["ollama"] as const;');
    expect(as).not.toContain("googleKey");
    expect(as).not.toContain("openaiKey");
    expect(as).not.toContain("anthropicKey");

    const sc = project.getSourceFileOrThrow("src/lib/openapi/schemas.ts").getFullText();
    // `keys` collapses to an empty (but legal) object literal.
    expect(sc).toMatch(/keys:\s*z\.object\(\{\s*\}\)/);
    expect(sc).toContain("google: z.string()"); // unrelated Locale field untouched
  });
});

describe("rewriteSettingsDefaults", () => {
  it("rewrites the six provider/model defaults", () => {
    const project = projectWith("src/lib/db/schema.ts", read("schema.ts"));
    rewriteSettingsDefaults(project, {
      chatProvider: "openai", chatModel: "gpt-4o-mini",
      embeddingProvider: "openai", embeddingModel: "text-embedding-3-small",
      parserProvider: "openai", parserModel: "gpt-4o-mini",
      imageProvider: "openai", imageModel: "gpt-4o-mini",
      unifiedProvider: "openai", unifiedModel: "gpt-4o-mini",
    });
    const text = project.getSourceFileOrThrow("src/lib/db/schema.ts").getFullText();
    expect(text).toContain('.default("openai")');
    expect(text).toContain('.default("gpt-4o-mini")');
    expect(text).toContain('.default("text-embedding-3-small")');
    expect(text).not.toContain('.default("google")');
    expect(text).not.toContain('.default("gemma-4-31b-it")');
  });

  it("rewrites image + unified provider/model defaults", () => {
    const project = projectWith("src/lib/db/schema.ts", read("schema.ts"));
    rewriteSettingsDefaults(project, {
      chatProvider: "openai", chatModel: "gpt-4o-mini",
      embeddingProvider: "openai", embeddingModel: "text-embedding-3-small",
      parserProvider: "openai", parserModel: "gpt-4o",
      imageProvider: "openai", imageModel: "gpt-4o",
      unifiedProvider: "openai", unifiedModel: "gpt-4o-mini",
    });
    const text = project.getSourceFileOrThrow("src/lib/db/schema.ts").getFullText();
    expect(text).toContain('.default("gpt-4o")'); // image_model
    expect(text).toContain('"image_provider"'); // column still present
    expect(text).not.toContain('.default("google")'); // no stale google default remains for the rewritten columns
  });
});

describe("pruneChunksFromSchema", () => {
  it("removes the chunks table, the local EMBEDDING_DIMENSIONS, and the now-unused vector import", () => {
    const project = projectWith("src/lib/db/schema.ts", read("schema.ts"));
    pruneChunksFromSchema(project);
    const text = project.getSourceFileOrThrow("src/lib/db/schema.ts").getFullText();
    expect(text).not.toContain('pgTable("chunks"');
    expect(text).not.toContain("EMBEDDING_DIMENSIONS");
    // `vector` was only used by the chunks column → dropped from the pg-core import
    expect(text).not.toMatch(/\bvector\b/);
    // Other tables + their imports survive
    expect(text).toContain('pgTable("settings"');
    expect(text).toContain('pgTable("messages"');
    expect(text).toContain("integer");
    expect(text).toContain("jsonb");
  });

  it("also removes the pgvector-only imageVectors table", () => {
    const project = projectWith("src/lib/db/schema.ts", read("schema.ts"));
    pruneChunksFromSchema(project);
    const text = project.getSourceFileOrThrow("src/lib/db/schema.ts").getFullText();
    expect(text).not.toContain('pgTable("image_vectors"');
    expect(text).not.toContain("imageVectors");
    // the universal images metadata table survives
    expect(text).toContain('pgTable("images"');
  });
});
