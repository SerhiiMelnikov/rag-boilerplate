import { describe, it, expect } from "vitest";
import { generateReadme } from "./readme.js";
import type { InstallOptions } from "./options.js";

const opts = (over: Partial<InstallOptions> = {}): InstallOptions => ({
  projectName: "my-rag-app", providers: ["google"], defaultProvider: "google", vectorStore: "pgvector",
  git: false, install: false, packageManager: "npm", yes: true, ...over,
});

describe("generateReadme", () => {
  it("google + pgvector: mentions the project, Google, pgvector, npm run dev, and omits Qdrant/vectorstore:init", () => {
    const readme = generateReadme(opts({ providers: ["google"], defaultProvider: "google", vectorStore: "pgvector" }));
    expect(readme).toContain("# my-rag-app");
    expect(readme).toContain("Google");
    expect(readme).toContain("pgvector");
    expect(readme).toContain("npm run dev");
    expect(readme).not.toContain("Qdrant");
    expect(readme).not.toContain("vectorstore:init");
  });

  it("openai + qdrant: mentions Qdrant, vectorstore:init, the Node 20/22 note, and OpenAI", () => {
    const readme = generateReadme(opts({ providers: ["openai"], defaultProvider: "openai", vectorStore: "qdrant" }));
    expect(readme).toContain("Qdrant");
    expect(readme).toContain("vectorstore:init");
    expect(readme).toContain("Node 20/22");
    expect(readme).toContain("OpenAI");
  });

  it("anthropic + google + weaviate: lists both providers and Weaviate", () => {
    const readme = generateReadme(opts({ providers: ["anthropic", "google"], defaultProvider: "google", vectorStore: "weaviate" }));
    expect(readme).toContain("Anthropic");
    expect(readme).toContain("Google");
    expect(readme).toContain("Weaviate");
  });

  it("non-pgvector: includes a db:generate step before db:migrate", () => {
    const readme = generateReadme(opts({ vectorStore: "qdrant" }));
    expect(readme).toContain("db:generate");
    const genIdx = readme.indexOf("db:generate");
    const migrateIdx = readme.indexOf("db:migrate");
    expect(genIdx).toBeGreaterThan(-1);
    expect(migrateIdx).toBeGreaterThan(genIdx); // generate comes before migrate
  });

  it("pgvector: has no db:generate step (migrations ship pre-generated)", () => {
    const readme = generateReadme(opts({ vectorStore: "pgvector" }));
    expect(readme).not.toContain("db:generate");
    expect(readme).toContain("db:migrate");
  });
});

describe("generateReadme setup steps", () => {
  // A non-pgvector project has no shipped migrations and builds its schema with
  // db:generate, which emits DDL only — the seed step is the only thing that creates
  // the General workspace there, and every workspace lookup resolves through it.
  it("tells a non-pgvector user that seed:admin creates the default workspace", () => {
    const readme = generateReadme(opts({ vectorStore: "qdrant" }));
    expect(readme).toContain("npm run db:generate");
    expect(readme).toMatch(/npm run seed:admin.*General/);
  });

  it("says the same for pgvector, where the migration already seeded it", () => {
    expect(generateReadme(opts({ vectorStore: "pgvector" }))).toMatch(/npm run seed:admin.*General/);
  });
});
