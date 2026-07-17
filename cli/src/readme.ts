import type { InstallOptions } from "./options.js";
import { PROVIDERS, VECTOR_STORES, type VectorStoreModule } from "./modules.js";

// Host-side migration/seed steps, shared by "Getting started" (npm run dev)
// and "Deploying" (the container doesn't run migrations, so they run from the
// host there too). db:generate is required for every non-pgvector store
// because scaffold() deletes the shipped drizzle/ migrations for them (they
// don't apply to a different schema); vectorstore:init is required only for
// stores that need their collection/index created before first use.
function hostMigrationSteps(o: InstallOptions, store: VectorStoreModule): string[] {
  const steps: string[] = [];
  if (o.vectorStore !== "pgvector") steps.push("`npm run db:generate` (generate the database migrations for your schema)");
  steps.push("`npm run db:migrate`");
  steps.push('`npm run seed:admin` (creates the admin user and the default "General" workspace)');
  if (store.initNeeded) steps.push("`npm run vectorstore:init`");
  return steps;
}

// Pure function: renders the generated app's own README, tailored to the
// caller's provider/vector-store selection. No filesystem access here —
// scaffold() is the one that writes the result to disk, so this stays easy
// to unit test.
export function generateReadme(o: InstallOptions): string {
  const store = VECTOR_STORES[o.vectorStore];
  const providerLabels = o.providers.map((p) => PROVIDERS[p].label);

  const lines: string[] = [];

  lines.push(`# ${o.projectName}`, "");
  lines.push(
    "A full-stack Retrieval-Augmented Generation (RAG) chat app (Next.js App " +
      "Router, Auth.js, Drizzle + Postgres) generated with `rag-boilerplate`.",
    "",
  );

  lines.push("## Stack", "");
  lines.push(`- **AI providers:** ${providerLabels.join(", ")}`);
  lines.push(`- **Vector store:** ${store.label}`);
  lines.push("");

  lines.push("## Getting started", "");
  let step = 1;
  lines.push(`${step++}. \`npm install\` (skip this if the installer already installed dependencies for you)`);
  lines.push(
    `${step++}. \`.env\` is already generated with a fresh \`AUTH_SECRET\` / \`SETTINGS_ENCRYPTION_KEY\`; ` +
      "set provider API keys later in the admin UI (admin → Provider keys). Set " +
      "`ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` if you want non-default admin credentials.",
  );
  const composeCmd = `docker compose up -d db minio${store.dockerService ? ` ${store.dockerService}` : ""}`;
  lines.push(
    `${step++}. Start services: \`${composeCmd}\` (Postgres + MinIO for image storage, plus the selected ` +
      "self-hosted store if any; Pinecone is managed → no extra service).",
  );
  for (const s of hostMigrationSteps(o, store)) lines.push(`${step++}. ${s}`);
  lines.push(`${step++}. \`npm run dev\` → http://localhost:3000`);
  lines.push("");

  const notes: string[] = [];
  if (o.vectorStore === "qdrant") notes.push("- Run under Node 20/22 LTS (the Qdrant client breaks on Node ≥ 26).");
  if (o.vectorStore === "pinecone") notes.push("- Create a Pinecone account and set `PINECONE_API_KEY` in `.env` before running `vectorstore:init`.");
  if (notes.length > 0) {
    lines.push("### Notes", "", ...notes, "");
  }

  lines.push("## Secrets", "");
  lines.push("Your `.env` was generated with two fresh secrets — you do not need to create them:", "");
  lines.push("- `AUTH_SECRET` — signs the session JWTs.");
  lines.push("- `SETTINGS_ENCRYPTION_KEY` — the AES-256-GCM master key that encrypts the");
  lines.push("  provider API keys you enter in the admin panel, so they are never stored in");
  lines.push("  plaintext in the database. It must decode to exactly 32 bytes.", "");
  lines.push("**Do not change `SETTINGS_ENCRYPTION_KEY` after you have saved provider keys** —");
  lines.push("the stored keys are encrypted with it and would become unreadable; you would have");
  lines.push("to re-enter them. Keep `.env` out of version control (it already is), and set both");
  lines.push("secrets as real environment variables when you deploy. To generate one yourself:", "");
  lines.push("```bash");
  lines.push("openssl rand -base64 32");
  lines.push("```");
  lines.push("");

  lines.push("## Admin", "");
  lines.push("Sign in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env`. Under the");
  lines.push("profile menu you can:", "");
  lines.push("- **Files** — upload documents (PDF/DOCX/Markdown/text) and images, see their");
  lines.push("  status, and set which workspaces each one belongs to.");
  lines.push("- **Workspaces** — create workspaces and grant users access to them.");
  lines.push("- **Provider keys** — set your API keys (encrypted at rest). Do this first:");
  lines.push("  nothing can be ingested or answered without them.");
  lines.push("- **Settings** — pick the chat/embedding/image models, tune retrieval, set rate limits");
  lines.push("  (chat requests per minute and per day per user). `0` disables a limit — see");
  lines.push("  **Rate limits** below. Also configure the allowed-domains list and SMTP for");
  lines.push("  registration — see **Registration** below.");
  lines.push("- **Users** — manage accounts and roles.");
  lines.push("- **Analytics** — see how answers were rated.");
  lines.push("");

  lines.push("## Rate limits", "");
  lines.push("These are on by default and take effect immediately: the migration that adds");
  lines.push("them backfills the existing settings row, so if this app was already deployed");
  lines.push("unlimited, it starts enforcing 20 chat requests/minute and 200/day per user the");
  lines.push("moment you run `db:migrate` — a user who was sending 250 messages a day will");
  lines.push("start getting 429s with no warning. Set either to `0` in **Settings** to disable");
  lines.push("it.", "");
  lines.push("The per-user chat cap bounds one account, not your total spend. Registration is");
  lines.push("gated (see **Registration** below), so this is no longer \"anyone can create");
  lines.push("unlimited accounts\" — but an attacker who does control a mailbox at an allowed");
  lines.push("domain can still create several and run each one up to its own cap. The rate");
  lines.push("limits and the registration gate cover different halves of the same budget");
  lines.push("problem; neither alone bounds total spend.");
  lines.push("");

  lines.push("## Registration", "");
  lines.push("Self-registration is gated, not open: `POST /api/register` takes an email");
  lines.push("address only, and only succeeds if it is at an allowed domain and the owner of");
  lines.push("that mailbox clicks the confirmation link sent to it. Nobody can log in until");
  lines.push("they do — the login gate rejects any account whose email is not yet verified.", "");
  lines.push("**SMTP must be configured before anyone can register.** Until you fill in the SMTP");
  lines.push("host/port/user/from and password under **Admin → Settings**, registration returns 503");
  lines.push("— there is no mailer yet to send the verification link with. This is the first");
  lines.push("thing you will hit on a fresh install; it is expected, not a bug.", "");
  lines.push("The allowed-domains list (also in Settings) is comma-separated, e.g.");
  lines.push("`company.com,contractor.com`. **An empty list denies everyone** — deliberately:");
  lines.push("treating empty as \"allow all\" would silently accept registrations from anyone.");
  lines.push("`npm run seed:admin` seeds it from `ADMIN_EMAIL`'s domain, so a fresh install");
  lines.push("already has a working allowlist; widen it in Settings as needed.", "");
  lines.push("`AUTH_URL` is required in production: the verification link must point");
  lines.push("somewhere trustworthy, and a proxy that forwards the client's `Host` header");
  lines.push("verbatim would otherwise let an attacker mint a link to their own server,");
  lines.push("capturing a victim's token. Without it, production registration fails with 503");
  lines.push("rather than trust the request. See `.env.example` for the variable.", "");
  lines.push("The confirmation link expires in 24 hours. Registering never sets a password —");
  lines.push("whoever clicks the link chooses it, on the form the link opens.");
  lines.push("");

  lines.push("## Workspaces", "");
  lines.push("Workspaces scope what the assistant can see. Every user always has access to");
  lines.push("**General**, and the assistant answers from the active workspace *plus* General.", "");
  lines.push("1. Upload a file — it lands in **General** by default, so it is visible to everyone.");
  lines.push("2. To restrict it, create a workspace under **Workspaces**, then open the file's");
  lines.push("   workspace cell in **Files** and move it there (a file may belong to several");
  lines.push("   workspaces at once; unchecking them all leaves it `unassigned`, which keeps it");
  lines.push("   in the list but hides it from the assistant).");
  lines.push("3. Grant users access to that workspace under **Workspaces → Access**.");
  lines.push("4. Those users can now pick it from the switcher in the chat header. Users with");
  lines.push("   access to only General see no switcher — there is nothing to switch between.");
  lines.push("");

  lines.push("## Deploying", "");
  lines.push("The app ships as a Docker image. To run the whole stack — Postgres, MinIO");
  lines.push("and the app itself:", "");
  lines.push("```bash");
  lines.push("docker compose --profile app up --build");
  lines.push("```");
  lines.push("");
  lines.push("Local development is unaffected: without `--profile app`, `docker compose up -d db");
  lines.push("minio` still starts only the dependencies.", "");
  lines.push("The `app` service's `environment:` block overrides the `localhost` URLs `.env`");
  lines.push("carries for Postgres, object storage, and the selected vector store (if it runs");
  lines.push("its own container) with their in-network service names — inside the container,");
  lines.push("`localhost` means the container itself, not its neighbors. Keep those overrides");
  lines.push("if you edit the compose file.", "");
  lines.push("**The container does not run migrations.** It is a standalone Next.js server with");
  lines.push("no `drizzle-kit`, so run the following from the host against the database before");
  lines.push("the first start:", "");
  for (const s of hostMigrationSteps(o, store)) lines.push(`- ${s}`);
  lines.push("");
  lines.push("`GET /api/health` returns 200 when Postgres is reachable and 503 when it is not;");
  lines.push("Docker's healthcheck uses it. When deploying outside compose, pass `DATABASE_URL`,");
  lines.push("`AUTH_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `AUTH_TRUST_HOST=true` and the `S3_*`");
  lines.push("variables as real environment variables — `.env` is never baked into the image.");
  lines.push("`AUTH_TRUST_HOST` is required: Auth.js rejects the incoming Host header in");
  lines.push("production otherwise (`UntrustedHost`), and every login fails with a 500.");
  lines.push("");

  lines.push("## Images", "");
  lines.push("Uploaded images are captioned by a vision model, and the caption is embedded. Ask");
  lines.push("the chat for a picture (\"show me a red bike\") and the matching images come back");
  lines.push("inline; click one to open it in a lightbox. Relevance is decided by the model");
  lines.push("reading the captions, not by a similarity cutoff.", "");
  lines.push("You can edit a caption in **Files**, or hit **Regenerate** to re-run the vision");
  lines.push("model on the stored image — useful after changing the image model. Nothing is");
  lines.push("re-uploaded; the bytes already live in object storage.");
  lines.push("");

  return lines.join("\n");
}
