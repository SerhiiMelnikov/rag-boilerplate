import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pruneProviderFactory, narrowProviderUnions, pruneVectorFactory, pruneVectorInitScript, pruneProviderCatalog, pruneSettingsServiceProviders, pruneOpenApiProviderLists, pruneTranscriptionAdapter, rewriteSettingsDefaults, pruneChunksFromSchema } from "./source.js";

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

describe("pruneTranscriptionAdapter", () => {
  const TRANSCRIPTION = "src/lib/providers/transcription.ts";
  const load = () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(TRANSCRIPTION, readRepo(TRANSCRIPTION));
    return project;
  };
  const textOf = (project: Project) => project.getSourceFileOrThrow(TRANSCRIPTION).getFullText();

  // The confirmed build break this transform exists to close: scaffold.ts
  // deletes a removed provider's adapter file (src/lib/providers/<id>.ts)
  // outright, but transcription.ts's static imports of googleChat/openaiTranscription
  // were never pruned to match — a project scaffolded without google or without
  // openai shipped transcription.ts importing a file that no longer exists.
  it("removes the openai branch and its now-dead import, leaving the google branch intact", () => {
    const project = load();
    pruneTranscriptionAdapter(project, ["openai"]);
    const text = textOf(project);
    expect(text).not.toContain("openaiTranscription");
    expect(text).not.toContain('from "./openai"');
    expect(text).not.toContain('if (provider === "openai")');
    expect(text).toContain('if (provider === "google")');
    expect(text).toContain("googleChat");
    // experimental_transcribe is openai-only; generateText still serves the
    // surviving google branch and must not be swept out with it.
    expect(text).not.toContain("experimental_transcribe");
    expect(text).toContain("generateText");
  });

  it("removes the google branch and its now-dead import, leaving the openai branch intact", () => {
    const project = load();
    pruneTranscriptionAdapter(project, ["google"]);
    const text = textOf(project);
    expect(text).not.toContain("googleChat");
    expect(text).not.toContain('from "./google"');
    expect(text).not.toContain('if (provider === "google")');
    expect(text).toContain('if (provider === "openai")');
    expect(text).toContain("openaiTranscription");
    expect(text).not.toContain("generateText");
    expect(text).toContain("experimental_transcribe");
  });

  // --providers ollama (or anthropic, or anthropic+ollama): neither speech-capable
  // provider survives, SPEECH_PROVIDER_IDS is empty, and isTranscribeConfigured
  // must still compile and simply answer false. The whole "ai" import drops out
  // because both its named bindings become unused once both branches are gone.
  it("removes both branches and the whole now-unused 'ai' import when neither speech-capable provider survives", () => {
    const project = load();
    pruneTranscriptionAdapter(project, ["google", "openai", "anthropic"]);
    const text = textOf(project);
    expect(text).not.toContain('if (provider === "google")');
    expect(text).not.toContain('if (provider === "openai")');
    expect(text).not.toContain("googleChat");
    expect(text).not.toContain("openaiTranscription");
    expect(text).not.toMatch(/from "ai"/);
    // The rest of the file must still be well-formed: the capability check and
    // the unreachable fallback throw both survive untouched.
    expect(text).toContain("export function isTranscribeConfigured");
    expect(text).toContain("cannot transcribe");
  });

  // anthropic and ollama have no branch in this file at all — pruning either
  // (or both) is a legitimate no-op, the same way pruning a vector store nobody
  // selected removes zero cases from vectorstore/index.ts.
  it("is a no-op when the removed set has no speech-capable provider", () => {
    const project = load();
    const before = textOf(project);
    pruneTranscriptionAdapter(project, ["anthropic", "ollama"]);
    expect(textOf(project)).toBe(before);
  });

  // The contract, enforced loudly, matching pruneProviderCatalog's convention:
  // if this file's shape ever stops matching what the transform expects, it must
  // fail scaffold-time rather than silently leave a dead import in place — which
  // would just reproduce the defect this transform exists to close.
  it("throws when the expected if-branch is missing", () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      TRANSCRIPTION,
      'export async function transcribe(provider: string) { if (provider === "google") { return ""; } return ""; }',
    );
    expect(() => pruneTranscriptionAdapter(project, ["openai"])).toThrow(/if \(provider === "openai"\)/);
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

  it("throws when the PROVIDERS declaration is missing entirely", () => {
    const project = projectWith(CATALOG, "export const SOMETHING_ELSE = [];");
    expect(() => pruneProviderCatalog(project, ["google"])).toThrow(/PROVIDERS/);
  });

  it("throws when an entry has no string-literal id", () => {
    const project = projectWith(CATALOG, "export const PROVIDERS = [{ id: GOOGLE, label: \"Google\" }];");
    expect(() => pruneProviderCatalog(project, ["google"])).toThrow(/string literal/);
  });
});

describe("pruneSettingsServiceProviders", () => {
  const SVC = "src/lib/config/settings-service.ts";
  const load = () => projectWith(SVC, readRepo(SVC));
  const textOf = (project: Project) => project.getSourceFileOrThrow(SVC).getFullText();

  it("narrows both zod provider enums to the kept set", () => {
    const project = load();
    pruneSettingsServiceProviders(project, ["google"]);
    const text = textOf(project);
    expect(text).toContain('const CHAT_PROVIDERS = ["google"] as const');
    expect(text).toContain('const EMBEDDING_PROVIDERS = ["google"] as const');
  });

  it("keeps ollama in both lists when ollama is the only provider", () => {
    const project = load();
    pruneSettingsServiceProviders(project, ["ollama"]);
    const text = textOf(project);
    expect(text).toContain('const CHAT_PROVIDERS = ["ollama"] as const');
    // Ollama embeds, so the embedding enum is non-empty — z.enum([]) would throw
    // at module load, and validateSelection is what guarantees this can't happen.
    expect(text).toContain('const EMBEDDING_PROVIDERS = ["ollama"] as const');
  });

  it("drops anthropic from chat but leaves the embedding list alone", () => {
    const project = load();
    pruneSettingsServiceProviders(project, ["google", "ollama"]);
    const text = textOf(project);
    expect(text).toContain('const CHAT_PROVIDERS = ["google", "ollama"] as const');
    expect(text).toContain('const EMBEDDING_PROVIDERS = ["google", "ollama"] as const');
  });

  it("throws when a list stops being an array literal", () => {
    const project = projectWith(SVC, "const CHAT_PROVIDERS = providerIds();\nconst EMBEDDING_PROVIDERS = [] as const;");
    expect(() => pruneSettingsServiceProviders(project, ["google"])).toThrow(/array literal/);
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
      speechProvider: "openai", speechModel: "gpt-4o-mini-transcribe",
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
      speechProvider: "openai", speechModel: "gpt-4o-mini-transcribe",
    });
    const text = project.getSourceFileOrThrow("src/lib/db/schema.ts").getFullText();
    expect(text).toContain('.default("gpt-4o")'); // image_model
    expect(text).toContain('"image_provider"'); // column still present
    expect(text).not.toContain('.default("google")'); // no stale google default remains for the rewritten columns
  });

  it("leaves the speech default alone when the selection has no speech-capable provider", () => {
    const project = projectWith("src/lib/db/schema.ts", read("schema.ts"));
    rewriteSettingsDefaults(project, {
      chatProvider: "ollama", chatModel: "llama3.1",
      embeddingProvider: "ollama", embeddingModel: "nomic-embed-text",
      parserProvider: "ollama", parserModel: "llava",
      imageProvider: "ollama", imageModel: "llava",
      unifiedProvider: "ollama", unifiedModel: "llama3.1",
      speechProvider: null, speechModel: null,
    });
    const text = project.getSourceFileOrThrow("src/lib/db/schema.ts").getFullText();
    // A null pair leaves the schema's own speech_provider default untouched
    // rather than writing the string "null".
    expect(text).toContain('.default("google")');
    expect(text).not.toContain('.default("null")');
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
