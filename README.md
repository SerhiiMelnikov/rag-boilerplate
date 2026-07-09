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

- A chat UI with streaming answers, source citations, and 👍/👎 rating
- An admin panel: document upload/management, provider API keys (encrypted
  at rest), retrieval settings, user management, rating analytics
- A hand-rolled RAG engine: chunking, parsing (PDF/DOCX/Markdown/text),
  embeddings, hybrid (vector + keyword) retrieval, ingestion
- Auth.js-based authentication with admin/user roles
- Drizzle ORM + Postgres for documents, users, chat history, and settings
- A `.env` pre-populated with fresh secrets, and a `README.md` tailored to
  your selection

Unselected providers/vector-store adapters, their dependencies, and related
`docker-compose.yml` services are pruned from the generated app — it only
ever references what you picked.

## Development

This repo's root (outside `cli/`) is the source the template snapshot is
built from — it's a normal Next.js app you can run directly for developing
the installer itself, but it is not the product `npx rag-boilerplate`
installs.

For building, testing, and publishing the installer package, see
[`cli/README.md`](cli/README.md).
