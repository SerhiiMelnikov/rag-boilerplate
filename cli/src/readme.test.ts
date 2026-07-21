import { describe, it, expect } from "vitest";
import { generateReadme } from "./readme.js";
import type { InstallOptions } from "./options.js";

const opts = (over: Partial<InstallOptions> = {}): InstallOptions => ({
  projectName: "my-rag-app", providers: ["google"], defaultProvider: "google", vectorStore: "pgvector",
  appKind: "full", git: false, install: false, packageManager: "npm", yes: true, ...over,
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

  // Registration is gated (see the Registration section), but the per-account chat
  // cap still only bounds one account — an attacker with a mailbox at an allowed
  // domain can create several. That has to be stated so an owner doesn't find out
  // from a bill that the gate alone wasn't the whole story.
  it("explains that the per-user chat cap does not bound total spend", () => {
    const out = generateReadme(opts());
    expect(out).toContain("## Rate limits");
    expect(out).toMatch(/bounds one account, not your total spend/);
    expect(out).toMatch(/neither alone bounds total spend/);
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

describe("generateReadme registration", () => {
  // The Registration section is the operator's first stop when registration
  // mysteriously 503s on a fresh install — it must say plainly that SMTP has to be
  // configured first, so nobody mistakes the 503 for a bug and goes bug-hunting.
  it("tells the operator that SMTP must be configured before registration works", () => {
    const out = generateReadme(opts());
    expect(out).toContain("## Registration");
    expect(out).toMatch(/SMTP must be configured before anyone can register/);
    expect(out).toMatch(/registration returns 503/);
  });

  // The empty-allowlist rule is the load-bearing security property of the whole
  // feature (see isEmailDomainAllowed and the design doc's "bootstrapping" section)
  // — an empty list must read as "deny all", not "allow all", and the README must
  // say so or an operator could assume the opposite and ship an open registration.
  it("states that an empty allowed-domains list denies everyone", () => {
    const out = generateReadme(opts());
    expect(out).toMatch(/An empty list denies everyone/);
    expect(out).toMatch(/seed:admin.*seeds it from `ADMIN_EMAIL`'s domain/);
  });

  it("documents AUTH_URL as required in production and the 24-hour link expiry", () => {
    const out = generateReadme(opts());
    expect(out).toMatch(/AUTH_URL.*required in production/s);
    expect(out).toMatch(/expires in 24 hours/);
    expect(out).toMatch(/whoever clicks the link chooses it/);
  });
});

describe("generateReadme API docs", () => {
  // The scaffolded app ships /docs (Scalar) and /api/openapi.json (Tasks 1-5 of
  // the OpenAPI feature); the generated README must tell the user both exist.
  it("mentions the interactive API reference and the raw OpenAPI document", () => {
    const readme = generateReadme(opts());
    expect(readme).toContain("## API docs");
    expect(readme).toContain("/docs");
    expect(readme).toContain("/api/openapi.json");
  });
});

describe("generateReadme appKind: api", () => {
  it("says there is no frontend/admin UI and mentions the standalone Hono server", () => {
    const readme = generateReadme(opts({ appKind: "api" }));
    expect(readme).toMatch(/no frontend/i);
    expect(readme).toMatch(/Hono/);
    expect(readme).not.toMatch(/profile menu/i); // full-app-only UI language
  });

  it("documents POST /api/auth/login issuing a bearer token", () => {
    const readme = generateReadme(opts({ appKind: "api" }));
    expect(readme).toContain("## Authentication");
    expect(readme).toContain("/api/auth/login");
    expect(readme).toMatch(/Authorization: Bearer/);
  });

  it("tells the operator to set VERIFY_URL because there is no /verify page", () => {
    const readme = generateReadme(opts({ appKind: "api" }));
    expect(readme).toContain("VERIFY_URL");
    expect(readme).toMatch(/no `\/verify` page/i);
    expect(readme).toContain("/api/auth/verify");
  });

  it("still documents /docs and /api/openapi.json", () => {
    const readme = generateReadme(opts({ appKind: "api" }));
    expect(readme).toContain("/docs");
    expect(readme).toContain("/api/openapi.json");
  });

  it("tells the user how to run it (npm run dev / start)", () => {
    const readme = generateReadme(opts({ appKind: "api" }));
    expect(readme).toContain("npm run dev");
    expect(readme).toContain("npm run start");
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
