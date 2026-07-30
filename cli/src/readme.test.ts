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

  // The repo's own README.md is in build-template.ts's EXCLUDE list, so it never
  // reaches a generated project — this generator is the only documentation those
  // users get. Without these, the eval runner ships invisible.
  // The Admin section enumerates the profile menu's entries, so a new admin page
  // that never gets listed here is invisible to everyone who scaffolds a project —
  // the repo's own README is in build-template.ts's EXCLUDE and never ships.
  it("lists the usage dashboard among the admin pages", () => {
    const readme = generateReadme(opts({ appKind: "full" }));
    expect(readme).toContain("**Usage**");
    expect(readme).toContain("per workspace");
    expect(readme).toContain("GET /api/admin/usage");
  });

  it("documents the eval runner and its CI-gate flags in the full app", () => {
    const readme = generateReadme(opts({ appKind: "full" }));
    expect(readme).toContain("npm run eval");
    expect(readme).toContain("--min-judge");
    expect(readme).toContain("Admin → Evaluation");
  });

  it("documents the eval runner in api-only, where it is the only way to run one", () => {
    const readme = generateReadme(opts({ appKind: "api" }));
    expect(readme).toContain("npm run eval");
    expect(readme).toContain("--min-judge");
    // No admin panel exists in this build, so the questions must be described
    // as an API surface rather than a page.
    expect(readme).toContain("/api/admin/evaluation/questions");
    expect(readme).not.toContain("Admin → Evaluation");
  });
});

describe("generateReadme URL ingest and chunk preview", () => {
  // Both features shipped in the same branch as this generator's Admin section
  // was last touched (usage dashboard) and the eval runner before it — this repo
  // has now lost documentation to build-template.ts's README.md EXCLUDE twice.
  // This generator is the only README a scaffolded project gets, so these two
  // capabilities must be pinned here, not just in the repo's own README.md.
  it("documents ingesting a document from a URL in the full-app admin Files bullet", () => {
    const readme = generateReadme(opts({ appKind: "full" }));
    expect(readme).toContain("## Admin");
    expect(readme).toContain("ingest a");
    expect(readme).toContain("page directly from a URL");
    expect(readme).toContain("Ingest URL");
  });

  it("documents the chunk preview in the full-app admin section", () => {
    const readme = generateReadme(opts({ appKind: "full" }));
    expect(readme).toContain("**Chunk preview**");
    expect(readme).toContain("chunk's position and length");
    expect(readme).toMatch(/order-unknown/);
  });

  it("api-only: documents POST /api/admin/documents/url for ingesting a page", () => {
    const readme = generateReadme(opts({ appKind: "api" }));
    expect(readme).toContain("POST /api/admin/documents/url");
    expect(readme).toMatch(/readable article text/);
  });

  it("api-only: documents GET /api/admin/documents/{id}/chunks for chunk inspection", () => {
    const readme = generateReadme(opts({ appKind: "api" }));
    expect(readme).toContain("GET /api/admin/documents/{id}/chunks");
    expect(readme).toMatch(/position/);
  });
});

describe("password reset documentation", () => {
  it("documents the three auth endpoints in both app kinds", () => {
    for (const appKind of ["full", "api"] as const) {
      const readme = generateReadme(opts({ appKind }));
      expect(readme).toContain("/api/auth/forgot-password");
      expect(readme).toContain("/api/auth/reset-password");
      expect(readme).toContain("/api/auth/password");
    }
  });

  // RESET_URL only means anything to a headless consumer running its own UI.
  // Documenting it in a full-app README would send people hunting for a setting
  // that does nothing there.
  it("documents RESET_URL in the api README only", () => {
    expect(generateReadme(opts({ appKind: "api" }))).toContain("RESET_URL");
    expect(generateReadme(opts({ appKind: "full" }))).not.toContain("RESET_URL");
  });

  // The limitation is real and users must not discover it by surprise. Both app
  // kinds emit these lines, so both must keep saying it.
  it("states that a password change ends existing sessions, and where that is enforced", () => {
    for (const appKind of ["full", "api"] as const) {
      const readme = generateReadme(opts({ appKind }));
      expect(readme).toMatch(/signs? (you |the user )?out/i);
      expect(readme).toContain("API routes");
    }
  });

  // The full-app README used to claim "every endpoint behind it refuses to
  // return data", which is false: the admin analytics and usage pages query the
  // database directly from a server component, so a retired admin session still
  // sees real conversation content. Naming the exception is the whole point.
  it("names the server-rendered page exception instead of implying blanket coverage", () => {
    const readme = generateReadme(opts({ appKind: "full" }));
    expect(readme).toContain("known exception");
    expect(readme).toMatch(/analytics and usage/i);
    expect(readme).not.toContain("refuses to return data");
  });
});

describe("OAuth documentation", () => {
  it("documents both providers and their variables in both app kinds", () => {
    for (const appKind of ["full", "api"] as const) {
      const readme = generateReadme(opts({ appKind }));
      expect(readme).toContain("GOOGLE_CLIENT_ID");
      expect(readme).toContain("GITHUB_CLIENT_ID");
      expect(readme).toContain("/api/auth/callback/");
    }
  });

  // Leaving them unset must read as a supported state, not an omission. Pinned to the
  // exact sentence from oauthSection rather than a loose regex: /no (OAuth )?buttons?|
  // disabled|nothing/i previously matched unrelated prose already in the README (e.g.
  // "there is nothing to bundle", "nothing can be ingested...") and passed with the
  // section removed entirely — asserting nothing about this feature.
  it("says OAuth is simply off when nothing is configured, in both app kinds", () => {
    for (const appKind of ["full", "api"] as const) {
      const readme = generateReadme(opts({ appKind }));
      expect(readme).toContain("Set neither and OAuth is simply off");
      expect(readme).toContain("no buttons, nothing to configure");
    }
  });

  // The allowlist governs OAuth too — a reader must not assume it is a bypass. Pinned
  // to the exact sentence rather than /allow(ed|list)/i, which previously matched the
  // unrelated "allowed domain" wording already present in the Registration section and
  // passed even with oauthSection removed entirely.
  it("states that the domain allowlist applies to OAuth sign-ins, in both app kinds", () => {
    for (const appKind of ["full", "api"] as const) {
      const readme = generateReadme(opts({ appKind }));
      expect(readme).toContain("The email-domain allowlist applies to OAuth too");
    }
  });

  // The handoff flow means nothing to a full-app deployment.
  it("documents the handoff flow and OAUTH_SUCCESS_URL in the api README only", () => {
    expect(generateReadme(opts({ appKind: "api" }))).toContain("OAUTH_SUCCESS_URL");
    expect(generateReadme(opts({ appKind: "api" }))).toContain("/api/auth/oauth/exchange");
    expect(generateReadme(opts({ appKind: "full" }))).not.toContain("OAUTH_SUCCESS_URL");
  });
});
