# create-rag-boilerplate (`rag-boilerplate` CLI)

Scaffold a full-stack Next.js RAG (retrieval-augmented generation) app —
create-t3-app style. The CLI copies a prebuilt template of the app at the
repo root, prunes it down to the AI providers and vector store you choose,
and writes a ready-to-run project.

## Usage

```bash
npx rag-boilerplate my-app
```

Run without a project name and the CLI prompts for it interactively, along
with the AI providers, the default provider, the vector store, and whether
to run `git init` / install dependencies afterwards.

### Flags

| Flag | Description |
| --- | --- |
| `<project-name>` (positional) | Directory to create. Prompted for if omitted. |
| `--providers <list>` | Comma-separated AI providers to include: `google`, `openai`, `anthropic`, `ollama`. |
| `--default-provider <id>` | Which of the selected providers is used by default (chat + doc parsing). |
| `--vector-store <id>` | Vector store to include: `pgvector`, `qdrant`, `chroma`, `weaviate`, `pinecone`. |
| `--install` / `--no-install` | Run the package manager install after scaffolding. |
| `--git` / `--no-git` | Run `git init` after scaffolding. |
| `-y`, `--yes` | Accept defaults for anything not passed on the command line (no prompts). |

At least one selected provider must support embeddings (`google`, `openai`,
or `ollama` — `anthropic` cannot embed on its own). The default provider must
be one of the selected providers.

## How it works

- **Template.** `npm run build:template` copies the repo root into
  `cli/template/`, excluding dev-only scaffolding (`cli/`, `docs/`,
  `.superpowers/`, `node_modules/`, `.next/`, `.git/`, lockfiles, build
  artifacts). Its `.gitignore` is stored as `_gitignore` so npm doesn't strip
  it from the published package; `scaffold()` renames it back to `.gitignore`
  in the generated project.
- **Prune.** Based on your selections, `scaffold()` removes the unselected
  provider adapter files and vector-store directories, prunes
  `package.json` dependencies, trims the unused services/volumes out of
  `docker-compose.yml`, drops the unused vector-store blocks from
  `.env.example`, and rewrites source (factories, discriminated unions, admin
  lists, settings defaults) via `ts-morph` so the generated app only
  references what you kept.
- **`.env`.** A fresh `.env` is generated with newly minted secrets
  (`NEXTAUTH_SECRET`, encryption key, etc.) plus the vector-store connection
  vars for the store you picked.
- **`prepack`.** Publishing (`npm publish` / `npm pack`) runs
  `npm run build:template && npm run build` automatically, so `dist/` and
  `template/` are always fresh in the published tarball. Both directories are
  build artifacts — they are gitignored and rebuilt on demand, not committed.

## Testing

```bash
cd cli
npx vitest run        # unit tests (fast, no filesystem-heavy work)
npx tsc --noEmit       # type-check the CLI itself
```

### Gated integration test

`src/installer.integration.test.ts` scaffolds a few real provider/vector-store
combinations into temp directories and asserts the generated app is pruned
correctly (removed deps/files absent, selected ones present). It is skipped
by default and only runs when explicitly enabled, since it needs the
template assembled first:

```bash
cd cli
npm run build:template
RUN_INTEGRATION=1 npx vitest run src/installer.integration.test.ts
```

The test also type-checks each scaffolded app with `tsc --noEmit`, but only
if that app already has `node_modules` (dependency install is skipped for
speed, so this step is a no-op unless you wire it up manually).

### Full check (dependency install + build)

To fully verify a scaffolded app end to end, including the Next.js build,
run the installer for real and then build the generated project:

```bash
npx rag-boilerplate test-app --providers openai --default-provider openai --vector-store qdrant --no-git --no-install -y
cd test-app
npm install
npm run build
```

This is slower than the gated integration test (it installs real
dependencies) and isn't part of the normal test suite; use it before
publishing a release or after touching the ts-morph transforms.

## Publishing

`package.json` lists `files: ["dist", "template"]` and a `prepack` script
that builds both, so a real `npm publish` (or `npm pack`) always ships fresh
build artifacts without `src/`, `test-fixtures/`, or any dev-only files. To
verify locally without publishing:

```bash
cd cli
npm pack --dry-run
```
