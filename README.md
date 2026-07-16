# rag-boilerplate

An `npx` scaffolder that generates a full-stack, production-ready
**Retrieval-Augmented Generation (RAG) chat app** — Next.js (App Router) +
TypeScript, with a headless/restyleable chat UI, an admin panel, role-based
auth, a hand-rolled RAG engine, and **image RAG** (upload images, have an AI
caption them, and get them back in chat by description) — configured for the AI
providers and vector store **you** pick.

This repository *is* the installer. The app it generates lives as a template
snapshot under `cli/template/` (built from this repo's own source by
`cli/scripts/build-template.ts`) and is pruned down to your selection at
scaffold time — it is not meant to be run directly out of this repo.

## Quick start

```bash
npx rag-boilerplate my-app
```

Run without a project name and you'll be prompted for one, along with:

- **AI providers** (multi-select) — which providers to include
- **Default provider** — which of the selected providers chat + document
  parsing use by default (changeable later in Admin → Settings)
- **Vector store** — where document chunks + embeddings are stored
- Whether to run `git init` and install dependencies afterwards

### Non-interactive flags

| Flag | Description |
| --- | --- |
| `<project-name>` (positional) | Directory to create. Prompted for if omitted. |
| `--providers <list>` | Comma-separated AI providers: `google`, `openai`, `anthropic`, `ollama`. |
| `--default-provider <id>` | Which selected provider is used by default. |
| `--vector-store <id>` | `pgvector`, `qdrant`, `chroma`, `weaviate`, or `pinecone`. |
| `--no-install` | Skip the package-manager install step. |
| `--no-git` | Skip `git init`. |
| `-y`, `--yes` | Accept defaults for anything not passed on the command line (no prompts). |

At least one selected provider must support embeddings (`google`, `openai`,
or `ollama` — `anthropic` cannot embed on its own), and the default provider
must be one of the selected providers.

## Module options

- **Providers:** Google Gemini, OpenAI, Anthropic Claude, Ollama (local)
- **Vector stores:** pgvector (Postgres, default), Qdrant, Chroma, Weaviate,
  Pinecone (managed)

## What you get

The generated app includes:

- A chat UI with streaming answers, source citations, 👍/👎 rating, and a
  workspace switcher; retrieved images open in a lightbox
- Workspaces: group documents and images, grant users access, and scope the
  assistant's answers to the active workspace plus the always-available General
  one (a file can belong to several workspaces)
- Image RAG: a vision model captions each uploaded image (describing people and
  animals in depth), and the model decides which images actually answer a request
- An admin panel: a unified Files list (documents + images, with workspace
  membership), workspaces and user access, provider API keys (encrypted at rest),
  retrieval settings, user management, rating analytics
- **Rate limits** — under **Settings**, cap chat requests per minute and per day
  (per user) and registrations per hour (per IP). Set any of them to `0` to
  disable that limit. **They are on by default, and are not as strong as they
  look — see [Rate limits](#rate-limits) below.**
- A hand-rolled RAG engine: chunking, parsing (PDF/DOCX/Markdown/text),
  embeddings, hybrid (vector + keyword) retrieval, ingestion
- Auth.js-based authentication with admin/user roles
- Drizzle ORM + Postgres for documents, users, chat history, and settings;
  S3-compatible object storage (MinIO locally) for image bytes
- A `.env` pre-populated with fresh secrets, and a `README.md` tailored to
  your selection

Unselected providers/vector-store adapters, their dependencies, and related
`docker-compose.yml` services are pruned from the generated app — it only
ever references what you picked.

## Rate limits

The chat (per user, per minute + per day) and registration (per IP, per hour)
limits under Settings exist because `/api/chat` sits in front of a paid model:
without a cap, one runaway client could spend your entire budget. Read this
before you rely on them.

- **They take effect immediately, with no warning.** `drizzle/0012` adds the
  three limit columns as `NOT NULL DEFAULT` and backfills the existing
  `settings` row, so an existing deployment that was previously unlimited
  starts enforcing 20/min and 200/day per user, and 5/hour per IP for
  registration, the moment you run `db:migrate` — not when you first open
  Settings. A power user sending 250 messages a day will start seeing 429s
  with no notice. Set any of the three to `0` to disable it.
- **The registration limit only works behind a reverse proxy that OVERWRITES
  `x-forwarded-for`.** Vercel, Fly, and nginx configured with
  `proxy_set_header X-Forwarded-For $remote_addr;` all overwrite it, so it
  binds. The commonly copy-pasted nginx recipe `proxy_set_header
  X-Forwarded-For $proxy_add_x_forwarded_for;` *appends* instead — the
  client-supplied value stays first in the chain, and the app reads the first
  hop, so an attacker can send a fresh forged header on every request and get
  a fresh bucket every time. And with no reverse proxy at all (`next start` on
  a bare VPS, `npm run dev`), there is no `x-forwarded-for` header at all, so
  the check is skipped entirely — a deliberate fail-open (see the `clientIp`
  comment in `src/app/api/register/handler.ts`), not a bug. In both of the
  broken cases, the admin panel still shows whatever limit you configured; it
  is not actually being enforced. If mass signups matter to you, use
  invitations or email verification — this limit only raises the cost of
  scripted registration, it does not remove it.
- **The per-user chat cap bounds one account, not your total spend.**
  Self-registration is effectively free, and the two limits compose: even
  behind a correctly overwriting proxy, 5 accounts/hour/IP is 120
  accounts/day/IP, and at 200 chat requests/day per account that is up to
  24,000 chat requests/day from a single IP. Actually closing that means
  restricting who can register — invitations, or disabling self-registration —
  which is planned separately and is not what these limits do today.

## Development

This repo's root (outside `cli/`) is the source the template snapshot is
built from — it's a normal Next.js app you can run directly for developing
the installer itself, but it is not the product `npx rag-boilerplate`
installs.

### Running this repo locally

`npx rag-boilerplate` writes a `.env` with freshly generated secrets for you.
Working on **this repo** you have to do that yourself:

```bash
cp .env.example .env

# Both are required, and both must be replaced — the placeholders will not work.
# AUTH_SECRET signs the session JWTs; SETTINGS_ENCRYPTION_KEY is the AES-256-GCM
# master key that encrypts the provider API keys stored in the database, so it
# must decode to exactly 32 bytes.
openssl rand -base64 32   # → AUTH_SECRET
openssl rand -base64 32   # → SETTINGS_ENCRYPTION_KEY

docker compose up -d db minio   # + your vector store's service, if self-hosted
npm install
npm run db:migrate
npm run seed:admin              # admin user + the default "General" workspace
npm run dev                     # → http://localhost:3000
```

Leaving `SETTINGS_ENCRYPTION_KEY` unset (or not 32 bytes once base64-decoded)
fails fast on the first settings read, with a message saying which of the two it
is. Changing it later makes the already-encrypted provider keys unreadable — you
would have to re-enter them in the admin panel.

### Deploying with Docker

The app itself ships as an image. To run the whole stack — Postgres, MinIO and the app:

```bash
cp .env.example .env    # then fill in the secrets (see Secrets above)
docker compose --profile app up --build
```

The app is served on http://localhost:3000. Without `--profile app` nothing changes: `docker compose up -d db minio` still starts only the dependencies, which is what local development uses.

**Migrations are not run by the container.** The image is a standalone Next.js server and carries no `drizzle-kit`, so schema changes and the admin seed stay a host step — run them once against the database before the first start:

```bash
npm run db:migrate
npm run seed:admin
```

The container exposes `GET /api/health`, which returns `200` when it can reach Postgres and `503` when it cannot. Docker's own healthcheck uses it, so `docker compose ps` reports the app as `healthy` only once the database is genuinely reachable.

Deploying the image somewhere other than compose: supply `DATABASE_URL`, `AUTH_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `AUTH_TRUST_HOST=true` and the `S3_*` variables as real environment variables. `.env` is deliberately excluded from the image — secrets are never baked into a layer. `AUTH_TRUST_HOST` is required because Auth.js rejects the incoming Host header in production otherwise ("UntrustedHost"), and every login fails with a 500 — `docker-compose.yml` already sets it for the `app` service.

For building, testing, and publishing the installer package, see
[`cli/README.md`](cli/README.md).
