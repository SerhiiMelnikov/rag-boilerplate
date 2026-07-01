# RAG Boilerplate

A production-ready **Retrieval-Augmented Generation (RAG) chat** starter built with
Next.js (App Router) + TypeScript. It ships a headless, restyleable chat UI, an
admin panel for documents and retrieval settings, role-based auth, and a clean,
hand-rolled RAG engine — all on one configuration: **Google Gemini + Postgres/pgvector**.

> This is the "golden path" configuration (Subproject 1). Future work makes the
> providers/vector-stores swappable and wraps everything in an `npx` installer.

## Stack

- **Web:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Headless UI (minimal, dark-mode-first — easy to restyle)
- **Auth:** Auth.js v5 (credentials) with JWT sessions and admin/user roles
- **Database:** Postgres (documents, users, chat history, settings — always here) plus
  chunks + vector search, stored in either Postgres/`pgvector` (default) or Qdrant,
  selected by `VECTOR_STORE`; both are wired through Drizzle ORM / a shared `VectorStore` interface
- **AI (Google Gemini):** chat model `gemma-4-31b-it`, embeddings `gemini-embedding-2` at 768 dimensions (Vercel AI SDK)
- **Docs ingestion:** PDF, DOCX, Markdown, plain text

## Prerequisites

- **Node.js 20+**
- **Docker** (runs the bundled Postgres + pgvector)
- A provider API key (e.g. a free Google AI Studio key — https://aistudio.google.com/apikey) — entered in the app at Admin → Provider keys after first run, NOT in .env

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your env file and fill it in
cp .env.example .env
```

Edit `.env`:

| Variable | What to put |
| --- | --- |
| `DATABASE_URL` | Leave the default — it matches the bundled Docker database (`postgres://rag:rag@localhost:5432/rag`) |
| `AUTH_SECRET` | A random secret — generate with `openssl rand -base64 32` |
| `SETTINGS_ENCRYPTION_KEY` | 32-byte base64 — generate with `openssl rand -base64 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credentials for the first admin account |

```bash
# 3. Start the database (Postgres + pgvector in Docker)
npm run db:up

# 4. Apply the schema
npm run db:migrate

# 5. Create the admin user from ADMIN_EMAIL / ADMIN_PASSWORD
npm run seed:admin
```

### Using Qdrant instead of pgvector

By default chunks are stored in Postgres/`pgvector`. To use Qdrant instead:

```bash
# In .env: set VECTOR_STORE=qdrant and QDRANT_URL (defaults shown in .env.example)

# Start Qdrant
docker compose up -d qdrant

# Postgres is still required (documents/users/chat history/settings live there)
npm run db:up

# Create the Qdrant collection
npm run vectorstore:init
```

## Run

```bash
npm run dev
```

Open http://localhost:3000. Sign in with your admin credentials, or register a
regular account at `/register` (self-registration always creates a normal user;
admins are created only via `npm run seed:admin`).

Then open Admin → Provider keys and paste at least one provider API key; until
a key is set for the configured chat/embedding provider, chat and ingestion
report a clear "not configured" message.

## Add documents (ingestion)

Before the assistant can answer from your knowledge base, index some documents:

- **From the UI (admin):** go to **Documents** → upload a `.pdf`, `.docx`, `.md`, or `.txt` file.
- **From the CLI (bulk):**
  ```bash
  npm run ingest -- ./path/to/your/docs
  ```
  It recursively indexes every supported file in the folder and is safe to
  re-run (unchanged content is skipped).

## Use it

- **Chat:** start a new conversation and ask a question. Answers stream in, with a
  **Sources** line showing which documents were used, and 👍/👎 rating buttons.
- **Admin → Documents:** upload / view status / delete indexed documents.
- **Admin → Settings:** tune retrieval — `topK`, model, temperature, system prompt,
  minimum similarity, and the context token budget.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm test` | Unit tests (no database needed) |
| `npm run test:integration` | Real-DB integration tests (needs the Docker database; sets `RUN_INTEGRATION=1`) |
| `npm run db:up` | Start Postgres + pgvector in Docker |
| `npm run db:generate` | Generate a Drizzle migration from the schema |
| `npm run db:migrate` | Apply migrations |
| `npm run ingest -- <path>` | Bulk-ingest a file or folder |
| `npm run seed:admin` | Create the admin user from env |
| `npm run vectorstore:init` | Create the Qdrant collection (only needed when `VECTOR_STORE=qdrant`) |

## Testing

- `npm test` runs the unit suite (services and routes are tested with injected
  dependencies / mocked auth — no database or API key required).
- `npm run test:integration` runs the database-backed tests (start the Docker DB
  and apply migrations first). These are skipped by the default `npm test`.

## Project layout

```
src/
  lib/rag/        RAG engine: chunking, parsing, embeddings, retrieval, ingestion, query
  lib/db/         Drizzle schema + client + migrator
  lib/auth/       password hashing, users service, RBAC guards
  lib/chat/       conversations & messages service
  lib/settings/   admin settings service
  lib/documents/  documents service
  app/api/        route handlers (auth, chat, conversations, messages, admin)
  app/(app)/      authenticated pages (chat + admin)
  components/     UI (chat, admin, auth form, theme)
scripts/          ingest + seed-admin CLIs
drizzle/          generated SQL migrations
```

The RAG engine and the provider/database wiring are deliberately thin and
readable — they are the seams intended for swapping in other models or vector
stores later.

## Configuration notes

- **Hybrid retrieval.** Search fuses dense vector similarity (pgvector) with
  Postgres full-text keyword search via Reciprocal Rank Fusion, so named-entity
  and keyword questions still find the right chunk when dense similarity ranks it
  too low. The keyword branch uses a GIN index (migration `0003`).
- **`AUTH_SECRET` is required** at runtime for Auth.js to sign sessions.
- **Layout-heavy PDFs.** Plain PDF text extraction loses 2D structure, so
  multi-column layouts and tables can come out in the wrong reading order. When
  such a layout is detected, the parser re-extracts the PDF with the
  admin-configured document-parser model that preserves reading order; it
  falls back to flat text if that call fails. This costs one model call per
  affected document at ingest time (one-time, deduped).
- **Chat model latency.** The chat model is configurable in **Admin → Settings**.
  Large models on the free tier can have a high time-to-first-token; a
  `gemini-*-flash` model streams noticeably faster if responses feel slow.
- **Provider API keys are managed in Admin → Settings (encrypted at rest).** Set
  them in **Admin → Settings → Provider keys**; they are encrypted with
  `SETTINGS_ENCRYPTION_KEY` (AES-256-GCM), which is required before saving any
  key. Per-task model selection (chat / embedding / document parser) lives there
  too. All model calls (chat, embeddings, document parser) use these DB-stored
  keys; there is no environment fallback. A missing or invalid key surfaces as
  a clear message in chat and on the document's status — never a silent
  failure.
- Embedding dimension is set by `EMBEDDING_DIMENSIONS` (default 768); switching
  embedding provider/model to a different width requires re-indexing.
- **Vector store backend is set by `VECTOR_STORE`** (`pgvector` default, or
  `qdrant`). Switching stores requires re-indexing — vectors are not shared
  between backends. Qdrant's keyword search is a pragmatic `MatchText`
  approximation (Qdrant has no `ts_rank`/BM25), so hybrid ranking there is
  slightly weaker than pgvector's Postgres full-text search.
