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
  (per user). Set either of them to `0` to disable that limit. **They are on
  by default — see [Rate limits](#rate-limits) below.**
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

The chat rate limits (per user, per minute + per day) under Settings exist
because `/api/chat` sits in front of a paid model: without a cap, one runaway
client could spend your entire budget. Read this before you rely on them.

- **They take effect immediately, with no warning.** `drizzle/0012` adds the
  limit columns as `NOT NULL DEFAULT` and backfills the existing `settings`
  row, so an existing deployment that was previously unlimited starts
  enforcing 20/min and 200/day per user the moment you run `db:migrate` — not
  when you first open Settings. A power user sending 250 messages a day will
  start seeing 429s with no notice. Set either to `0` to disable it.
- **The per-user chat cap bounds one account, not your total spend.**
  Registration is gated (see [Registration](#registration) below), so this is
  no longer "anyone can create unlimited accounts" — but an attacker who does
  control a mailbox at an allowed domain can still create several accounts and
  run each one up to its own cap. The rate limits and the registration gate
  address different halves of the same budget problem; neither alone bounds
  total spend.

## Registration

Self-registration is **gated**, not open: `POST /api/register` takes an email
address only, and only succeeds if the address is at an **allowed domain**
and the owner of that mailbox clicks the confirmation link that gets sent to
it. Nobody can log in until they do — `authorizeCredentials` rejects any user
whose `emailVerifiedAt` is still null.

**The first thing a new operator hits: registration returns 503 until SMTP is
configured.** The gate needs to send an email, so a fresh install has no way
to complete a registration yet. Fix it in **Admin → Settings**: fill in the
SMTP host, port, user and from address (plain) and the password (encrypted at
rest, shown masked afterwards). Once saved, registration starts sending real
verification emails. This is not a bug — it is the safe default: nobody can
be verified before there is a mailer to verify them with.

The **allowed domains** list (also in Settings) is a comma-separated list of
domains, e.g. `company.com,contractor.com`. **Empty means nobody can
register** — that is deliberate, not a bug: treating empty as "allow all"
would mean a fresh install silently accepts registrations from the whole
internet, which is exactly the hole this feature closes. `npm run seed:admin`
seeds this list from `ADMIN_EMAIL`'s domain on first run, so a fresh install
already has a working, correctly-scoped allowlist instead of a second dead
end; widen it in Settings as needed.

`AUTH_URL` is **required in production** for the same reason SMTP is: the
verification link has to point somewhere trustworthy. `/api/register` is not
an Auth.js route, so `AUTH_TRUST_HOST` does not cover it — and a proxy that
forwards the client's `Host` header verbatim (a common config) would let an
attacker mint a verification link pointing at their own server, capturing a
victim's token. Without `AUTH_URL` set, production registration fails loudly
with 503 rather than trust the request's `Host`. In development the request's
own origin is used instead, since there is no proxy and no attacker to spoof
it. See `.env.example` for the variable.

Once SMTP and the allowlist are set: registering emails a link that expires
in **24 hours**. Clicking it — not registering — is what sets the password;
the registration request itself never carries one. Submitting that form
verifies the email and enables login.

**Upgrading an existing install:** migration `0013` marks every pre-existing
user as verified, including any at a domain the new allowlist would refuse —
the alternative (locking real users out on upgrade) is worse, but it means
anyone who self-registered through the old open endpoint keeps both their
account and their access to the shared budget. Audit `users` after upgrading
and block (**Admin → Users**) anyone you don't want to keep.

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

Deploying the image somewhere other than compose: supply `DATABASE_URL`, `AUTH_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `AUTH_TRUST_HOST=true`, `AUTH_URL` and the `S3_*` variables as real environment variables. `.env` is deliberately excluded from the image — secrets are never baked into a layer. `AUTH_TRUST_HOST` is required because Auth.js rejects the incoming Host header in production otherwise ("UntrustedHost"), and every login fails with a 500. `AUTH_URL` is required for the same reason registration needs it everywhere else (see [Registration](#registration)) — without it, every registration 503s instead. `docker-compose.yml` already sets both for the `app` service, pointed at `http://localhost:3000`; change that value for any real deployment.

For building, testing, and publishing the installer package, see
[`cli/README.md`](cli/README.md).
