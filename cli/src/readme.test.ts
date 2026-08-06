import { describe, it, expect } from "vitest";
import { generateReadme } from "./readme.js";
import type { InstallOptions } from "./options.js";

const opts = (over: Partial<InstallOptions> = {}): InstallOptions => ({
  projectName: "my-rag-app", providers: ["google"], defaultProvider: "google", vectorStore: "pgvector",
  appKind: "full", git: false, install: false, packageManager: "npm", yes: true, ...over,
});

// --- Markdown table structure ----------------------------------------------
//
// A cell is split on every UNESCAPED `|`, which is what a GFM renderer does —
// there is no exemption for a pipe inside a code span, and `\|` is the only
// escape. This is not pedantry: a renderer discards the cells past the header's
// column count, so one stray pipe deletes the whole rest of that row from the
// rendered page while the source still looks complete.
function splitRow(line: string): string[] {
  const parts = line.trim().split(/(?<!\\)\|/);
  // A well-formed row opens and closes with a pipe, so the outermost fragments
  // are empty and are not cells.
  if (parts.length && parts[0].trim() === "") parts.shift();
  if (parts.length && parts[parts.length - 1].trim() === "") parts.pop();
  return parts.map((c) => c.trim());
}

/** Every GFM table in `md`: a `|`-row immediately followed by a `| --- |` rule. */
function markdownTables(md: string): { header: string[]; rows: string[][]; lineNo: number }[] {
  const lines = md.split("\n");
  const tables: { header: string[]; rows: string[][]; lineNo: number }[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].trimStart().startsWith("|")) continue;
    if (!/^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(lines[i + 1])) continue;
    const rows: string[][] = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].trimStart().startsWith("|"); j++) rows.push(splitRow(lines[j]));
    tables.push({ header: splitRow(lines[i]), rows, lineNo: i + 1 });
    i = j - 1;
  }
  return tables;
}

// Nothing in this file asserted table STRUCTURE, which is how an unescaped `|`
// inside a code span shipped: `{ "available": true|false }` split the cell in
// two, and GFM dropped everything past the header's column count — the whole
// "call it once to decide whether to show a microphone" guidance vanished from
// every generated api-only README while the source still read correctly.
//
// Deliberately over EVERY table in BOTH builds, not just the row that was
// found: this must catch the next stray pipe, wherever it lands.
describe("generateReadme markdown tables render as written", () => {
  for (const appKind of ["full", "api"] as const) {
    it(`has no ${appKind} table row a renderer would silently truncate`, () => {
      const tables = markdownTables(generateReadme(opts({ appKind })));
      expect(tables.length, "expected this build to contain tables at all").toBeGreaterThan(0);
      for (const table of tables) {
        for (const row of table.rows) {
          expect(
            row.length,
            `table at line ${table.lineNo} (${table.header.join(" | ")}): the row starting ` +
              `"${row[0]}" splits into ${row.length} cells but the header declares ` +
              `${table.header.length}. A renderer discards the extras — escape the stray pipe as \\| ` +
              `or reword the cell to avoid it.`,
          ).toBe(table.header.length);
        }
      }
    });
  }

  // The specific content the truncation ate. Cell-count parity alone would pass
  // against a row that was shortened rather than split.
  it("keeps the whole GET /api/chat/transcribe guidance in its own cell", () => {
    const tables = markdownTables(generateReadme(opts({ appKind: "api" })));
    const row = tables.flatMap((t) => t.rows).find((r) => r[0].includes("GET /api/chat/transcribe"));
    expect(row, "the api-only README must document GET /api/chat/transcribe").toBeDefined();
    expect(row).toHaveLength(2);
    expect(row![1]).toMatch(/whether to show a microphone in your own UI/);
    expect(row![1]).toMatch(/already spoken/);
  });
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

  // scaffold.ts deletes src/lib/voice (the speech-synthesis helpers) for an api-only
  // build along with the rest of src/components — the section documenting them must
  // not appear in a README describing a project that does not ship them.
  it("explains the spoken-answers toggle in the full app, and omits it from api-only", () => {
    const full = generateReadme(opts({ appKind: "full" }));
    expect(full).toContain("## Voice");
    expect(full).toMatch(/speaker button/i);
    expect(full).toMatch(/no API key/i);
    expect(full).toMatch(/hidden entirely/i);          // no voice installed -> no button
    expect(full).toMatch(/per device/i);                // not per account
    expect(full).toMatch(/flatpak-confined/i);          // snap/flatpak browsers can't reach the system voice
    expect(full).toMatch(/distribution-packaged/i);     // the remedy: install a distro-packaged browser
    // The microphone paragraph, not just its neighbours — see cli/src/readme.ts's
    // "Questions can be asked by voice too" line.
    expect(full).toMatch(/microphone button records, stops/i);
    expect(full).toMatch(/hears no speech at all, or the provider comes back with nothing usable/i);

    const api = generateReadme(opts({ appKind: "api" }));
    expect(api).not.toContain("## Voice");
    expect(api).not.toMatch(/speaker button/i);
    expect(api).not.toMatch(/microphone button records, stops/i);
  });

  it("tells the admin to set provider keys before anything else", () => {
    expect(generateReadme(opts())).toMatch(/keys.*first|first.*keys/is);
  });

  it("tells the user the rate limits exist and how to disable them", () => {
    const out = generateReadme(opts());
    expect(out).toContain("rate limits");
    expect(out).toContain("`0` disables a limit");
  });

  // The transcription limits shipped with the microphone and were never written
  // down anywhere. A limit an operator does not know about is one they meet as
  // an unexplained 429.
  it("names the voice transcription limits alongside the chat ones", () => {
    const out = generateReadme(opts());
    expect(out).toMatch(/voice transcriptions per minute and per day/i);
    expect(out).toMatch(/10\/minute and 100\/day/);
    expect(out).toMatch(/second budget/i);
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

describe("generateReadme navigation", () => {
  // The rail (src/components/shell/nav-config.ts) replaced eight admin
  // destinations hardcoded inside a profile dropdown. This generator is the
  // only README a scaffolded project gets, so it must describe the rail, not
  // the navigation it replaced.
  it("describes the rail, not the old profile dropdown", () => {
    const readme = generateReadme(opts({ appKind: "full" }));
    expect(readme).toContain("left rail");
    expect(readme).toContain("Settings → Models");
    expect(readme).not.toContain("Admin → Evaluation");
    expect(readme).not.toMatch(/profile (menu|dropdown)/i);
  });

  it("still describes no screens at all for an api-only build", () => {
    const readme = generateReadme(opts({ appKind: "api" }));
    expect(readme).not.toContain("left rail");
    expect(readme).not.toContain("bottom bar");
  });

  // The rail — and with it the account menu holding Sign out — is hidden below
  // md; on a phone Sign out lives in the bottom bar's More sheet instead. This
  // generator is the only documentation a scaffolded project gets, so a phone
  // user has to be told where to find it.
  it("tells a phone user that Sign out lives behind More", () => {
    const readme = generateReadme(opts({ appKind: "full" }));
    expect(readme).toMatch(/Sign out.*behind.*More/);
  });
});

describe("the admin section describes the real navigation", () => {
  const readme = () => generateReadme(opts());

  it("names the three Settings pages", () => {
    const text = readme();
    expect(text).toContain("**Models**");
    expect(text).toContain("**Answering**");
    expect(text).toContain("**Access & email**");
  });

  // The old copy sent people to "Settings → Models" for SMTP, which was the wrong
  // page name even before this package moved it.
  // Scoped to the SMTP sentence itself: "Settings → Models" is now the correct
  // destination for the provider keys and appears legitimately elsewhere in the
  // same document, so a whole-document `not.toContain` would fail for the right
  // page being named in the wrong place.
  it("sends SMTP to Access & email, not to Models", () => {
    const smtpLine = readme().split("\n").find((l) => l.includes("host/port/user/from"));
    expect(smtpLine, "the SMTP sentence vanished from the generated README").toBeTruthy();
    expect(smtpLine).toContain("Settings → Access & email");
    expect(smtpLine).not.toContain("Settings → Models");
  });

  // Document parser is a real fourth independently-configurable row on the
  // Answering page (answering-form.tsx), alongside chat/embedding/image. The
  // bullet used to omit it, which is exactly the kind of thing a user reads
  // this README to find out.
  // The parser is a fourth, independently-configurable model row. It moved to the
  // Models bullet when Settings was repartitioned; naming three of the four models
  // was the original defect and the count still has to be right wherever it lands.
  it("mentions the Document parser model in the Models bullet", () => {
    const modelsLine = readme().split("\n").find((l) => l.includes("**Models**"));
    expect(modelsLine).toMatch(/parser/i);
  });

  // Not `not.toContain("/admin/keys")` — the README never printed URL paths, so
  // that assertion would pass whether or not this task did anything. Pin the
  // Settings section's real content instead: the three bullets, in order.
  it("lists exactly the three Settings pages, in nav order", () => {
    const section = readme().split("### Settings")[1].split("### People")[0];
    const bullets = section.split("\n").filter((l) => l.startsWith("- **"));
    expect(bullets.map((l) => l.slice(4, l.indexOf("**", 4)))).toEqual([
      "Models",
      "Answering",
      "Access & email",
    ]);
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

  // Migration 0020 unforks accounts an upgrading install may already have split
  // by casing. Both builds must say addresses are lower-cased and that a forked
  // account's chats become unreachable, without inventing UI that appKind: "api"
  // does not ship (there is no Users page there).
  it("documents that emails are lower-cased and migration 0020 unforks duplicated accounts", () => {
    for (const appKind of ["full", "api"] as const) {
      const readme = generateReadme(opts({ appKind, vectorStore: "pgvector" }));
      expect(readme).toMatch(/stored and matched in lower case/);
      expect(readme).toMatch(/migration 0020/);
      expect(readme).toContain("name+dup-xxxxxxxx@domain");
      expect(readme).toMatch(/Nothing is deleted/);
    }
    expect(generateReadme(opts({ appKind: "full", vectorStore: "pgvector" }))).toMatch(/Users page/);
    expect(generateReadme(opts({ appKind: "api", vectorStore: "pgvector" }))).not.toMatch(/Users page/);
  });

  // scaffold() deletes drizzle/ for every non-pgvector store (cli/src/scaffold.ts
  // step 7b); that project's `npm run db:generate` builds fresh DDL-only
  // migrations from the current schema, so migration 0020 never ships there and
  // never runs. Promising a repair the project cannot perform would be worse
  // than silence, so the migration-0020 paragraph must not appear for those
  // stores — only the (still true, store-independent) lower-casing sentence.
  it("does not promise the migration 0020 repair to a non-pgvector store, which never ships it", () => {
    for (const appKind of ["full", "api"] as const) {
      const readme = generateReadme(opts({ appKind, vectorStore: "qdrant" }));
      expect(readme).toMatch(/stored and matched in lower case/);
      expect(readme).not.toMatch(/migration 0020/);
      expect(readme).not.toContain("name+dup-xxxxxxxx@domain");
    }
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

  // src/server/routes.ts serves both transcribe routes and API_ONLY_DELETE_PATHS
  // does not touch src/api, so this endpoint SHIPS in this build — it was simply
  // undocumented, which for a headless build means undiscoverable. The empty-text
  // contract is the load-bearing part: a consumer that posts "" as a message
  // reintroduces, in their own frontend, the exact defect this feature's server
  // guards exist to prevent.
  it("documents the transcribe endpoints that ship in this build", () => {
    const readme = generateReadme(opts({ appKind: "api" }));
    expect(readme).toContain("POST /api/chat/transcribe");
    expect(readme).toContain("GET /api/chat/transcribe");
    expect(readme).toMatch(/multipart\/form-data/);
    expect(readme).toMatch(/audio\/webm/);
    expect(readme).toMatch(/`415`/);
    expect(readme).toMatch(/`503`/);
    expect(readme).toMatch(/empty.*nothing was heard|nothing was said/i);
    expect(readme).toMatch(/do NOT[\s\S]{0,40}post it as a message/);
  });

  it("documents the transcription rate limits, not only the chat ones", () => {
    const readme = generateReadme(opts({ appKind: "api" }));
    expect(readme).toContain("transcribeRateLimitPerMinute");
    expect(readme).toContain("transcribeRateLimitPerDay");
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
  // The Admin section enumerates the rail's entries, so a new admin page that
  // never gets listed here is invisible to everyone who scaffolds a project —
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
    expect(readme).toContain("Insights → Evaluation");
  });

  it("documents the eval runner in api-only, where it is the only way to run one", () => {
    const readme = generateReadme(opts({ appKind: "api" }));
    expect(readme).toContain("npm run eval");
    expect(readme).toContain("--min-judge");
    // No admin panel exists in this build, so the questions must be described
    // as an API surface rather than a page.
    expect(readme).toContain("/api/admin/evaluation/questions");
    expect(readme).not.toContain("Insights → Evaluation");
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

  // The full-app README used to carve out server-rendered pages as a "known
  // exception" that could still show a retired admin session's data — the admin
  // analytics and usage pages queried the database directly from a server
  // component, bypassing the per-request session check API routes got. Page
  // guards now read the database too, so this documents parity instead of the
  // old caveat, and guards against both historical false claims re-appearing.
  it("documents that API routes and server-rendered pages share the same per-request check", () => {
    const readme = generateReadme(opts({ appKind: "full" }));
    expect(readme).toContain("API routes and server-rendered pages alike");
    expect(readme).toMatch(/middleware\.ts/);
    expect(readme).not.toContain("known exception");
    expect(readme).not.toContain("refuses to return data");
  });

  // The api-only build serves no pages at all, so it must not inherit language
  // written for the full app's page/API parity — that would describe a surface
  // pruned out of the project the reader is holding.
  it("does not mention server-rendered pages or middleware.ts in the api-only build", () => {
    const readme = generateReadme(opts({ appKind: "api" }));
    expect(readme).not.toContain("server-rendered pages");
    expect(readme).not.toMatch(/middleware\.ts/);
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
    }
  });

  // Buttons on a sign-in screen are a full-app promise only: the api-only build
  // deletes src/app and src/components outright, so there is no screen to put one
  // on. This assertion used to be made against BOTH kinds, which is precisely what
  // kept the api-only README describing a UI its own generator had pruned away.
  it("promises buttons on the sign-in screens in the full app, and denies them in api-only", () => {
    expect(generateReadme(opts({ appKind: "full" }))).toContain("sign-in and registration screens");
    expect(generateReadme(opts({ appKind: "full" }))).toContain("no buttons, nothing to configure");

    const api = generateReadme(opts({ appKind: "api" }));
    expect(api).not.toContain("sign-in and registration screens");
    expect(api).toContain("serves no pages, so there are no buttons");
  });

  // WHERE a half-configured pair surfaces differs by build, and getting it wrong
  // sends the reader to the wrong logs. The full app calls oauthConfig() while
  // src/auth.ts is still loading, so it cannot start; api-only calls it inside the
  // /api/auth/* route closure, so it boots fine and throws on the first request
  // that reaches Auth.js. The negative halves are what stop the shared "fails at
  // startup" wording coming back for api-only.
  it("says when a half-configured pair fails, per build mode", () => {
    const full = generateReadme(opts({ appKind: "full" }));
    expect(full).toContain("fails at\nstartup, naming the missing variable");
    expect(full).not.toContain("first `/api/auth/*`\nrequest");

    const api = generateReadme(opts({ appKind: "api" }));
    expect(api).toContain("fails on the first `/api/auth/*`\nrequest, naming the missing variable");
    expect(api).not.toContain("fails at\nstartup");
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

  // GET /api/auth/signin/<provider> throws (Auth.js's signin action only redirects
  // on a POST carrying a CSRF token, which a plain link cannot send) — the old
  // instruction sent readers straight at that failure. The negative assertion is
  // the one that matters: it is what stops the broken instruction coming back.
  it("points the headless first step at the GET-safe start endpoint, not the broken signin route", () => {
    const readme = generateReadme(opts({ appKind: "api" }));
    expect(readme).toContain("/api/auth/oauth/start/");
    expect(readme).not.toContain("/api/auth/signin/");
  });
});
