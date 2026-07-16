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

describe("generateReadme guidance", () => {
  // The generated README is the first thing a user reads. It must explain what the
  // features are FOR, not just list the admin pages.
  it("explains how to actually use workspaces", () => {
    const readme = generateReadme(opts());
    expect(readme).toContain("## Workspaces");
    expect(readme).toMatch(/always has access to/i);   // General is implicit
    expect(readme).toMatch(/unassigned/);              // the trap: hidden from the assistant
    expect(readme).toMatch(/switcher/i);               // how a user changes workspace
  });

  it("explains the image workflow, including regenerating a caption", () => {
    const readme = generateReadme(opts());
    expect(readme).toContain("## Images");
    expect(readme).toMatch(/lightbox/i);
    expect(readme).toMatch(/Regenerate/);
    expect(readme).toMatch(/re-uploaded/i);            // the point: bytes are already stored
  });

  it("tells the admin to set provider keys before anything else", () => {
    expect(generateReadme(opts())).toMatch(/keys.*first|first.*keys/is);
  });

  it("tells the user the rate limits exist and how to disable them", () => {
    const out = generateReadme(opts());
    expect(out).toContain("rate limits");
    expect(out).toContain("`0` disables a limit");
  });

  // Self-registration being open and free means the per-account chat cap does not
  // bound what an attacker can spend across many accounts — that has to be stated
  // so an owner doesn't find out from a bill.
  it("explains that the per-user chat cap does not bound total spend", () => {
    const out = generateReadme(opts());
    expect(out).toContain("## Rate limits");
    expect(out).toMatch(/bounds one account, not your total spend/);
    expect(out).toMatch(/invitations, or disabling self-registration/);
  });

  // drizzle/0012 backfills the limit columns onto the existing settings row, so an
  // already-deployed, previously-unlimited app starts throttling the instant the
  // migration runs — a power user could get 429s with zero warning otherwise.
  it("warns that the limits take effect immediately on migration", () => {
    const out = generateReadme(opts());
    expect(out).toMatch(/take effect immediately/);
    expect(out).toMatch(/db:migrate/);
  });
});

describe("generateReadme secrets", () => {
  // The scaffolder writes both secrets, but rotating the encryption key silently
  // orphans every provider key already stored in the DB — that must be stated.
  it("explains both secrets and warns against rotating the encryption key", () => {
    const readme = generateReadme(opts());
    expect(readme).toContain("## Secrets");
    expect(readme).toContain("SETTINGS_ENCRYPTION_KEY");
    expect(readme).toContain("AUTH_SECRET");
    expect(readme).toMatch(/32 bytes/);
    expect(readme).toMatch(/Do not change `SETTINGS_ENCRYPTION_KEY`/);
    expect(readme).toMatch(/openssl rand -base64 32/);
  });
});
