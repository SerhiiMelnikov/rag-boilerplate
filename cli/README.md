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
  picture and matching images are returned inline.
- **Image RAG** — upload images; a vision model captions each one, the caption is
  embedded, and an intent router returns the right image when a user describes it.
  Captions are editable in the admin UI (re-embedded on save).
- **Admin panel** — one **Files** list for documents *and* images (filter by type,
  sort, preview + caption-edit in a modal), plus users, provider API keys,
  retrieval settings, and answer-rating analytics.
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
npm run db:migrate
npm run seed:admin
npm run vectorstore:init        # only if your vector store needs it
npm run dev                     # → http://localhost:3000
```

A `.env` is generated for you with fresh secrets; set your provider API keys in
the admin UI after the first run.

## Requirements

- Node.js 18+ (note: the Qdrant client requires Node 20/22 LTS).
- Docker (for the self-hosted database / vector stores).

## Links

- **Repository & full documentation:** https://github.com/SerhiiMelnikov/rag-boilerplate
- **Issues:** https://github.com/SerhiiMelnikov/rag-boilerplate/issues

## License

MIT © Serhii Melnikov
