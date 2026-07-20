# rag-boilerplate

Scaffold a **full-stack Next.js RAG (retrieval-augmented generation) chat app** —
`create-next-app` style. One command generates a complete, runnable project
tailored to the AI providers and vector store you choose.

```bash
npx rag-boilerplate my-app
```

That's it — you get real files in `./my-app`: a Next.js App Router project with a
streaming chat UI, an admin panel, gated registration, and a working RAG engine,
already wired to your selections. It runs locally with one `docker compose`, and
ships as a Docker image when you're ready.

## What you get

- **Chat UI** — streaming answers with sources and 👍/👎 ratings; ask for a
  picture and matching images come back inline, opening in a lightbox you can page
  through.
- **Workspaces** — group documents and images into workspaces and grant users
  access to them. A user picks the active workspace in the header, and the
  assistant answers only from that workspace plus the always-available **General**
  one. A file can live in several workspaces at once.
- **Image RAG** — upload images; a vision model captions each one (describing any
  person or animal in depth, since that is what users search on), the caption is
  embedded, and an intent router returns the right image when a user describes it.
  Relevance is decided by the model reading the captions, not a similarity cutoff.
  Captions are editable, and can be regenerated from the stored image.
- **Gated registration** — an address must be at a **domain you allow**, and the
  mailbox must be **confirmed** before the account can log in. Whoever clicks the
  emailed link is the one who chooses the password. See [Who can sign up](#who-can-sign-up).
- **Rate limits** — per-user chat caps (per minute and per day), set in the admin
  panel. They exist because `/api/chat` sits in front of a paid model: without a
  cap, one runaway client spends your budget.
- **Admin panel** — one **Files** list for documents *and* images (filter by type
  or workspace, sort, preview, edit captions and workspace membership in a modal),
  plus workspaces, users, provider API keys, SMTP, retrieval settings, rate limits,
  and answer-rating analytics.
- **RAG engine** — chunking, PDF/DOCX/Markdown parsing, embeddings, hybrid
  (vector + keyword) retrieval with reciprocal-rank fusion.
- **Storage** — Postgres (+ your chosen vector store) for text; S3-compatible
  object storage (MinIO in local Docker) for image bytes.
- **Deployable** — a multi-stage, non-root Docker image plus a `GET /api/health`
  probe; `docker compose --profile app up` runs the whole stack.
- **Your stack only** — the providers and vector store you pick; everything else
  is pruned out (code, dependencies, Docker services, env vars).

## Options

Run `npx rag-boilerplate` with no arguments to be prompted for everything, or
pass flags for a non-interactive run:

| Flag | Description |
| --- | --- |
| `<project-name>` | Directory to create (prompted if omitted). |
| `--providers <list>` | Providers to include: `google`, `openai`, `anthropic`, `ollama`. |
| `--default-provider <id>` | Provider used by default for chat + document parsing. |
| `--vector-store <id>` | `pgvector`, `qdrant`, `chroma`, `weaviate`, or `pinecone`. |
| `--no-install` / `--install` | Skip / force dependency install. |
| `--no-git` / `--git` | Skip / force `git init`. |
| `-y`, `--yes` | Accept defaults for anything not passed (no prompts). |

At least one selected provider must support embeddings (`google`, `openai`, or
`ollama` — Anthropic has no embedding model). The default provider must be one of
the selected providers.

Example:

```bash
npx rag-boilerplate my-app --providers openai,anthropic --default-provider openai --vector-store qdrant
```

## After scaffolding

The generated project ships with its own tailored `README.md` describing the exact
steps for your selection. In short:

```bash
cd my-app
docker compose up -d db minio   # Postgres + MinIO (image storage); + your vector store's service, if self-hosted
npm run db:generate             # only if you did NOT pick pgvector (builds the migrations for your schema)
npm run db:migrate
npm run seed:admin              # admin user, the default "General" workspace, and the registration allowlist
npm run vectorstore:init        # qdrant, chroma, weaviate and pinecone only — pgvector needs no init
npm run dev                     # → http://localhost:3000
```

A `.env` is generated for you with fresh secrets. Sign in with its `ADMIN_EMAIL` /
`ADMIN_PASSWORD`.

### Configure two things before anyone can use it

1. **Provider API keys** (admin → *Provider keys*) — nothing can be ingested or
   answered without them. They are encrypted at rest and never shown again.
2. **SMTP** (admin → *Settings*) — needed only if other people will register.
   Until a host is set, registration returns **503** rather than pretending a
   confirmation link went out. Any relay works: Google Workspace, SES, Mailgun,
   Postmark, Resend, or your company's own. Locally you can point it at a catcher
   like MailHog and read the mail in a browser.

## Who can sign up

Registration is deliberately narrow, because an account is a key to your model
budget.

- An address must be at an **allowed domain** — a comma-separated list under
  admin → *Settings*. **Empty means nobody**; `seed:admin` seeds it from your
  `ADMIN_EMAIL`'s domain, so a fresh install isn't a dead end. Widen it there.
- Registration asks for an **email only**. A confirmation link is emailed, and
  whoever clicks it chooses the password — so someone who knows a colleague's
  address can never take that account, only invite them to it.
- The account cannot log in until that link is clicked. The link is single-use and
  expires in 24 hours.
- Registration is throttled per address and per domain, so the endpoint cannot be
  turned into a mail cannon aimed at someone's inbox.

**Deploying?** Set `AUTH_URL` to your public URL. In production the app refuses to
email a link whose address it cannot vouch for, and registration returns 503 until
you set it.

## Using it

- **Upload** documents and images under **Files**. They land in the **General**
  workspace, which every user can see.
- **Scope them** by creating a workspace under **Workspaces**, moving files into it
  from the Files list, and granting users access. A file can live in several
  workspaces at once.
- **Switch** workspace from the chat header: the assistant then answers only from
  that workspace plus General. (Users who can see only General get no switcher —
  there is nothing to switch between.) Each conversation belongs to the workspace
  it was started in, so the chat list shows only that workspace's conversations —
  switching workspace resets the open chat.
- **Ask for a picture** ("show me a red bike") and matching images come back inline;
  click one to open it in a lightbox.
- **Tune retrieval** and the chat rate limits under **Settings**; see how answers
  were rated under **Analytics**.

## Deploying

```bash
docker compose --profile app up --build
```

Runs Postgres, MinIO and the app together. Without `--profile app` nothing changes:
`docker compose up -d db minio` still starts just the dependencies for local
development.

The container does **not** run migrations — it is a standalone Next.js server with
no `drizzle-kit`. Run `npm run db:migrate` and `npm run seed:admin` from the host
against the database before the first start.

Deploying somewhere other than compose: pass `DATABASE_URL`, `AUTH_SECRET`,
`SETTINGS_ENCRYPTION_KEY`, `AUTH_URL` and the `S3_*` variables as real environment
variables. `.env` is never baked into the image. `GET /api/health` returns 200 when
Postgres is reachable and 503 when it is not; Docker's healthcheck uses it.

## Requirements

- Node.js 18+ (note: the Qdrant client requires Node 20/22 LTS).
- Docker (for the self-hosted database / vector stores, and to run the app image).

## Links

- **Repository & full documentation:** https://github.com/SerhiiMelnikov/rag-boilerplate
- **Issues:** https://github.com/SerhiiMelnikov/rag-boilerplate/issues

## License

MIT © Serhii Melnikov
