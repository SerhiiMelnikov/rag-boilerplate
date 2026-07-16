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

  // The registration limit silently does nothing unless the deployment sits behind
  // a proxy that OVERWRITES x-forwarded-for — a proxy that appends (the commonly
  // copy-pasted nginx recipe) or no proxy at all both leave it unenforced while the
  // admin panel shows a number that looks like protection. That has to be explicit,
  // not left for someone to discover after a bot signup wave.
  it("explains when the registration rate limit does not actually bind", () => {
    const out = generateReadme(opts());
    expect(out).toContain("## Rate limits");
    expect(out).toMatch(/OVERWRITES/);
    expect(out).toMatch(/APPENDS/);
    expect(out).toMatch(/invitations or email verification/);
  });

  // Self-registration being ~free means the per-account chat cap does not bound
  // what an attacker can spend across many accounts from one IP — that has to be
  // stated so an owner doesn't find out from a bill.
  it("explains that the per-user chat cap does not bound total spend", () => {
    const out = generateReadme(opts());
    expect(out).toMatch(/bounds one account, not your total spend/);
    expect(out).toMatch(/24,000 chat requests\/day/);
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

describe("generateReadme deploying", () => {
  it("documents the Docker deployment path and that migrations stay on the host", () => {
    const out = generateReadme(opts());
    expect(out).toContain("docker compose --profile app up --build");
    expect(out).toContain("does not run migrations");
  });

  // Auth.js rejects the Host header in production unless told otherwise, which
  // 500s every login when deployed outside compose (docker-compose.yml already
  // sets this for the `app` service) — the README must tell a self-hoster to set it.
  it("tells a self-hoster to set AUTH_TRUST_HOST outside compose", () => {
    const out = generateReadme(opts());
    expect(out).toContain("AUTH_TRUST_HOST");
  });

  // scaffold.ts deletes drizzle/ for every non-pgvector store (its shipped
  // migrations don't apply to a different schema), and Getting-started already
  // inserts db:generate for exactly that reason. The Deploying section's
  // host-step list must stay consistent with it: a qdrant/chroma/weaviate/
  // pinecone user following Deploying alone must run db:generate before
  // db:migrate finds no migrations, and vectorstore:init so the collection
  // actually gets created.
  it("non-pgvector: the Deploying section includes db:generate before db:migrate and vectorstore:init", () => {
    const out = generateReadme(opts({ vectorStore: "qdrant" }));
    const deploySection = out.slice(out.indexOf("## Deploying"));
    expect(deploySection).toContain("db:generate");
    expect(deploySection).toContain("vectorstore:init");
    const genIdx = deploySection.indexOf("db:generate");
    const migrateIdx = deploySection.indexOf("db:migrate");
    expect(migrateIdx).toBeGreaterThan(genIdx);
  });

  it("pgvector: the Deploying section has no db:generate step (migrations ship pre-generated)", () => {
    const out = generateReadme(opts({ vectorStore: "pgvector" }));
    const deploySection = out.slice(out.indexOf("## Deploying"));
    expect(deploySection).not.toContain("db:generate");
    expect(deploySection).toContain("db:migrate");
  });

  // pruneDockerCompose round-trips the generated compose file through a
  // YAML parser/stringifier, which drops all comments — including the one
  // explaining why the app service overrides .env's localhost URLs. That
  // explanation has to survive somewhere so a user editing the compose file
  // doesn't delete the overrides thinking they're dead code.
  it("explains that the app service overrides .env's localhost URLs for in-network addressing", () => {
    const out = generateReadme(opts());
    const deploySection = out.slice(out.indexOf("## Deploying"));
    expect(deploySection).toMatch(/localhost/i);
    expect(deploySection).toMatch(/in-network|container itself/i);
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
