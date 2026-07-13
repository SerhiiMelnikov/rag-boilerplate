# rag-boilerplate

Scaffold a **full-stack Next.js RAG (retrieval-augmented generation) chat app** —
`create-next-app` style. One command generates a complete, runnable project
tailored to the AI providers and vector store you choose.

```bash
npx rag-boilerplate my-app
```

That's it — you get real files in `./my-app`: a Next.js App Router project with a
streaming chat UI, an admin panel, authentication, and a working RAG engine,
already wired to your selections.

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
- **Admin panel** — one **Files** list for documents *and* images (filter by type
  or workspace, sort, preview, edit captions and workspace membership in a modal),
  plus workspaces, users, provider API keys, retrieval settings, and answer-rating
  analytics.
- **RAG engine** — chunking, PDF/DOCX/Markdown parsing, embeddings, hybrid
  (vector + keyword) retrieval with reciprocal-rank fusion.
- **Storage** — Postgres (+ your chosen vector store) for text; S3-compatible
  object storage (MinIO in local Docker) for image bytes.
- **Auth** — Auth.js (credentials) with admin/user roles.
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
npm run seed:admin              # admin user + the default "General" workspace
npm run vectorstore:init        # only if your vector store needs it
npm run dev                     # → http://localhost:3000
```

A `.env` is generated for you with fresh secrets. Sign in with its `ADMIN_EMAIL` /
`ADMIN_PASSWORD`, then **set your provider API keys in the admin panel first** —
nothing can be ingested or answered without them.

### Using it

- **Upload** documents and images under **Files**. They land in the **General**
  workspace, which every user can see.
- **Scope them** by creating a workspace under **Workspaces**, moving files into it
  from the Files list, and granting users access. A file can live in several
  workspaces at once.
- **Switch** workspace from the chat header: the assistant then answers only from
  that workspace plus General. (Users who can see only General get no switcher —
  there is nothing to switch between.)
- **Ask for a picture** ("show me a red bike") and matching images come back inline;
  click one to open it in a lightbox.

## Requirements

- Node.js 18+ (note: the Qdrant client requires Node 20/22 LTS).
- Docker (for the self-hosted database / vector stores).

## Links

- **Repository & full documentation:** https://github.com/SerhiiMelnikov/rag-boilerplate
- **Issues:** https://github.com/SerhiiMelnikov/rag-boilerplate/issues

## License

MIT © Serhii Melnikov
