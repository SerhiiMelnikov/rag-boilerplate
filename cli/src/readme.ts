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

// The evaluation harness, documented for both builds. It matters more in the
// api-only one: there is no admin panel there, so `npm run eval` is the only way
// to run an evaluation at all.
function evalSection(o: InstallOptions): string[] {
  const lines = ["## Evaluating retrieval quality", ""];
  lines.push(
    o.appKind === "api"
      ? "Golden questions are managed over the API (`/api/admin/evaluation/questions`). Once you have some, score the current settings against them:"
      : "Add golden questions under **Insights → Evaluation**, then score the current settings against them from the terminal:",
  );
  lines.push("");
  lines.push("```bash");
  lines.push("npm run eval                                    # report to stdout");
  lines.push("npm run eval -- --json                          # machine-readable");
  lines.push("npm run eval -- --min-judge 4 --min-recall 0.8  # exit 1 if below");
  lines.push("```");
  lines.push("");
  lines.push(
    "Each run is stored, so results stay comparable across settings changes" +
      (o.appKind === "api" ? " and are readable via `/api/admin/evaluation/runs`." : " and show up in the admin panel alongside UI-triggered runs."),
  );
  lines.push("");
  lines.push("The thresholds make this usable as a CI gate. A run with no golden questions exits 1 rather than passing green.");
  lines.push("");
  return lines;
}

// Documents the three password-reset/change endpoints, common to both builds.
// RESET_URL only means anything to a headless consumer running its own
// frontend (mirrors VERIFY_URL for registration), so it is documented only in
// the api-only README — a full-app deployment serves /reset itself.
function passwordSection(o: InstallOptions): string[] {
  const lines = ["## Passwords", ""];
  lines.push("| Endpoint | Purpose |");
  lines.push("| --- | --- |");
  lines.push(
    "| `POST /api/auth/forgot-password` | Emails a reset link. Answers `200` whether or not the address has an account — the response is deliberately identical either way, so it cannot be used to discover which addresses are registered. Rate limited per address and per email domain (`429`); a misconfigured or failing mailer answers `503`. |",
  );
  lines.push(
    "| `POST /api/auth/reset-password` | Consumes the emailed token and sets the new password. Single use; links expire after 1 hour. |",
  );
  lines.push(
    "| `POST /api/auth/password` | Changes the signed-in user's password. Requires the current password. Returns a fresh bearer token. |",
  );
  lines.push("");

  if (o.appKind === "api") {
    lines.push("Set `RESET_URL` to the full address of your own \"choose a new password\"");
    lines.push("screen, e.g. `https://your-app.example/reset`. It is the complete link target,");
    lines.push("not an origin — only `?token=...` is appended — and it wins over `AUTH_URL`.");
    lines.push("Without it, reset emails point at this backend, which serves no pages.");
    lines.push("");
  }

  lines.push("Resetting or changing a password signs the user out of every existing");
  lines.push("session: each account carries a cut-off timestamp, and any session token");
  lines.push("issued before it is refused.");
  if (o.appKind === "full") {
    // api-only server-renders nothing at all, so the "pages" half of this claim
    // would describe a surface that was pruned out of the project the reader is
    // holding — this branch is the one place it belongs.
    lines.push("This is enforced on **API routes and server-rendered pages alike**: both run");
    lines.push("the same per-request lookup, so blocking, deleting or demoting a user takes");
    lines.push("effect on their next request or navigation rather than whenever their cookie");
    lines.push("happens to expire. `middleware.ts` is the one deliberate exception — it runs");
    lines.push("on the edge with no database access, so it checks only that a session token");
    lines.push("exists at all, and the page behind it performs the real check.");
  } else {
    lines.push("This is enforced on **API routes**, by the same per-request lookup that makes");
    lines.push("blocking a user take effect immediately.");
  }
  lines.push("");
  return lines;
}

// Documents Google/GitHub sign-in, common to both builds. OAUTH_SUCCESS_URL and
// the handoff flow only mean anything to a headless consumer running its own
// frontend (mirrors RESET_URL/VERIFY_URL), so that part is documented only in
// the api-only README — a full-app deployment keeps the session cookie instead.
function oauthSection(o: InstallOptions): string[] {
  const lines = ["## Signing in with Google or GitHub", ""];
  // This paragraph is the one part of the section that cannot be shared: both of
  // its claims are about surfaces, and the two builds have different ones.
  //
  //   * Buttons. The api-only build has no `src/app` and no `src/components` at
  //     all, so promising a button on a sign-in screen describes a screen that was
  //     pruned out of the project the reader is holding.
  //   * When a half-configured pair fails. The full app calls oauthConfig() while
  //     `src/auth.ts` is still loading, so it cannot start. The api-only build
  //     calls it inside the `/api/auth/*` route closure, so the process boots
  //     perfectly and throws on the first request that reaches Auth.js — telling
  //     someone to watch startup logs there sends them looking in the wrong place.
  if (o.appKind === "api") {
    lines.push("Set both variables of a pair and that provider becomes available. This build");
    lines.push("serves no pages, so there are no buttons — see **Headless sign-in** below for");
    lines.push("how a sign-in begins. Set neither and OAuth is simply off — nothing to");
    lines.push("configure. Setting only one half of a pair fails on the first `/api/auth/*`");
    lines.push("request, naming the missing variable, rather than failing later on the");
    lines.push("provider's own consent screen.");
  } else {
    lines.push("Set both variables of a pair and that provider's button appears on the");
    lines.push("sign-in and registration screens. Set neither and OAuth is simply off —");
    lines.push("no buttons, nothing to configure. Setting only one half of a pair fails at");
    lines.push("startup, naming the missing variable, rather than failing later on the");
    lines.push("provider's own consent screen.");
  }
  lines.push("");
  lines.push("| Provider | Variables |");
  lines.push("| --- | --- |");
  lines.push("| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |");
  lines.push("| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |");
  lines.push("");
  lines.push("Register `<your-origin>/api/auth/callback/google` (and `/github`) as the");
  lines.push("redirect URI in the provider's console. `AUTH_URL` must be set, or the");
  lines.push("callback URL is derived from a request header that a proxy can forge.");
  lines.push("");
  lines.push("**The email-domain allowlist applies to OAuth too.** A sign-in whose address");
  lines.push("is outside it is refused, the same as a registration would be — OAuth is");
  lines.push("another door through that gate, not a way around it. An address the provider");
  lines.push("does not confirm as verified is refused as well, since linking an OAuth");
  lines.push("sign-in to an existing account rests entirely on that guarantee.");
  lines.push("");
  lines.push("A first OAuth sign-in creates the account, already verified. That account has");
  lines.push("no password; its owner can set one through the password-reset flow and then");
  lines.push("use either route.");
  lines.push("");

  if (o.appKind === "api") {
    lines.push("### Headless sign-in", "");
    lines.push("This build serves no pages, so the browser cannot end up holding a session");
    lines.push("cookie your own frontend can read. Set `OAUTH_SUCCESS_URL` to your screen's");
    lines.push("address and the flow ends there instead:", "");
    lines.push(
      "1. Send the user to `<origin>/api/auth/oauth/start/google` — one plain GET, so a",
    );
    lines.push(
      "   link or a deep link works. (Auth.js's own sign-in route needs a POST with a",
    );
    lines.push("   CSRF token, which a link cannot send.)");
    lines.push("2. After the provider, they land back at `OAUTH_SUCCESS_URL?code=...`.");
    lines.push("3. `POST /api/auth/oauth/exchange` with `{ \"code\": \"...\" }` returns");
    lines.push("   `{ \"token\": \"...\" }` — the same bearer token `POST /api/auth/login` gives.");
    lines.push("");
    lines.push("The code is single-use and expires after 60 seconds. A token is never put in");
    lines.push("the URL directly: query strings leak through `Referer` headers and browser");
    lines.push("history, and a code that dies on first use bounds that exposure.");
    lines.push("");
  }
  return lines;
}

// Pure function: renders the generated app's own README, tailored to the
// caller's provider/vector-store/appKind selection. No filesystem access here —
// scaffold() is the one that writes the result to disk, so this stays easy
// to unit test.
export function generateReadme(o: InstallOptions): string {
  return o.appKind === "api" ? generateApiOnlyReadme(o) : generateFullAppReadme(o);
}

function generateFullAppReadme(o: InstallOptions): string {
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
  lines.push(
    `${step++}. \`npm install\` (skip this if the installer already installed dependencies for you). ` +
      "This project ships a `package-lock.json` pinning the dependency versions the " +
      "boilerplate was tested against. npm reads it, while pnpm, yarn and bun each " +
      "resolve their own lockfile instead and ignore this one. It may be absent if the " +
      "scaffolder could not reconcile it against your selection (no network at scaffold " +
      "time, for example) — npm then resolves fresh, same as the other package managers.",
  );
  lines.push(
    `${step++}. \`.env\` is already generated with a fresh \`AUTH_SECRET\` / \`SETTINGS_ENCRYPTION_KEY\`; ` +
      "set provider API keys later under **Settings → Models**. Set " +
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
  lines.push("Sign in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env`.", "");
  lines.push(
    "Everything lives in the left rail: **Chat**, **Knowledge** (files and workspaces), " +
      "**Insights** (feedback, token usage, evaluation), **Settings** (answering, provider keys, access) " +
      "and **People** (users, super-admin only). The rail collapses to a bottom bar on a phone, " +
      "and **Sign out** lives behind **More** there.",
    "",
  );
  lines.push("### Knowledge", "");
  lines.push("- **Files** — upload documents (PDF/DOCX/Markdown/text) and images, or ingest a");
  lines.push("  page directly from a URL (paste it and click **Ingest URL** — no file, no");
  lines.push("  extension, just the page's readable article text); see status, and set which");
  lines.push("  workspaces each one belongs to.");
  lines.push("- **Chunk preview** — open a document's chunk preview (from **Files**) to see");
  lines.push("  each chunk's position and length. Chunks ingested before position tracking");
  lines.push("  was added show as order-unknown rather than being renumbered to hide the gap.");
  lines.push("- **Workspaces** — create workspaces and grant users access to them.");
  lines.push("");
  lines.push("### Insights", "");
  lines.push("- **Feedback** — see how answers were rated.");
  lines.push("- **Usage** — model tokens spent over the last 30 days: totals, per user and");
  lines.push("  per workspace, plus a daily trend. Also served as `GET /api/admin/usage`.");
  lines.push("  Replies that never reach the model record no tokens and are not counted.");
  lines.push("- **Evaluation** — golden questions and the runs scored against them; see");
  lines.push("  **Evaluating retrieval quality** below.");
  lines.push("");
  lines.push("### Settings", "");
  lines.push("- **Models** — pick the chat/embedding/parser/image model for each task, and set the");
  lines.push("  API keys they authenticate with (encrypted at rest). Do the keys first: nothing");
  lines.push("  can be ingested or answered without them. A key can also be cleared here, which");
  lines.push("  stops every task using that provider.");
  lines.push("- **Answering** — tune retrieval, set rate limits (chat requests per minute and");
  lines.push("  per day per user, and voice transcriptions per minute and per day).");
  lines.push("  `0` disables a limit — see **Rate limits** below. The system prompt lives");
  lines.push("  here too.");
  lines.push("- **Access & email** — the allowed-domains list and SMTP for registration; see");
  lines.push("  **Registration** below.");
  lines.push("");
  lines.push("### People", "");
  lines.push("- **Users** — manage accounts and roles (super-admin only).");
  lines.push("");

  lines.push("## API docs", "");
  lines.push("An interactive API reference is served at `/docs` (Scalar, self-hosted, no");
  lines.push("CDN), backed by the raw OpenAPI document at `/api/openapi.json`. Both are public");
  lines.push("(not gated behind login).");
  lines.push("");

  lines.push("## Rate limits", "");
  lines.push("These are on by default and take effect immediately: the migration that adds");
  lines.push("them backfills the existing settings row, so if this app was already deployed");
  lines.push("unlimited, it starts enforcing 20 chat requests/minute and 200/day per user the");
  lines.push("moment you run `db:migrate` — a user who was sending 250 messages a day will");
  lines.push("start getting 429s with no warning. Set either to `0` under **Settings →");
  lines.push("Answering** to disable it.", "");
  lines.push("Voice transcriptions are capped separately, and default to 10/minute and 100/day");
  lines.push("per user under the same **Settings → Answering** page. They are a second budget,");
  lines.push("not a share of the chat one: a spoken question spends a transcription request");
  lines.push("*and* a chat request, and transcription is billed per second of audio rather");
  lines.push("than per token. Set either to `0` to disable it. Hitting the cap answers 429 and");
  lines.push("sends nothing — what you said is not silently swallowed into the chat.", "");
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
  lines.push("host/port/user/from and password under **Settings → Access & email**, registration returns 503");
  lines.push("— there is no mailer yet to send the verification link with. This is the first");
  lines.push("thing you will hit on a fresh install; it is expected, not a bug.", "");
  lines.push("The allowed-domains list (also under **Settings → Access & email**) is");
  lines.push("comma-separated, e.g. `company.com,contractor.com`. **An empty list denies everyone**");
  lines.push("— deliberately: treating empty as \"allow all\" would silently accept");
  lines.push("registrations from anyone. `npm run seed:admin` seeds it from `ADMIN_EMAIL`'s domain,");
  lines.push("so a fresh install already has a working allowlist; widen it under");
  lines.push("**Settings → Access & email** as needed.", "");
  lines.push("`AUTH_URL` is required in production: the verification link must point");
  lines.push("somewhere trustworthy, and a proxy that forwards the client's `Host` header");
  lines.push("verbatim would otherwise let an attacker mint a link to their own server,");
  lines.push("capturing a victim's token. Without it, production registration fails with 503");
  lines.push("rather than trust the request. See `.env.example` for the variable.", "");
  lines.push("The confirmation link expires in 24 hours. Registering never sets a password —");
  lines.push("whoever clicks the link chooses it, on the form the link opens.");
  lines.push("");
  lines.push("Email addresses are stored and matched in lower case.");
  // Only a pgvector-store project ships migration 0020 at all: scaffold()
  // deletes drizzle/ for every other store, and their `npm run db:generate`
  // builds fresh DDL-only migrations from the current schema, with no
  // historical data migration to repair anything. Promising a repair to a
  // project that will never run that migration would be dishonest, so this
  // paragraph only appears for pgvector.
  if (o.vectorStore === "pgvector") {
    lines.push("If you are upgrading an install that ran 0.5.8, migration 0020 repairs");
    lines.push("accounts that OAuth forked: the confirmed row keeps the address and any");
    lines.push("duplicate is renamed to `name+dup-xxxxxxxx@domain` and blocked, for you to");
    lines.push("review on the Users page. Nothing is deleted — but note that chats made");
    lines.push("under a forked account stay in the database and are no longer reachable");
    lines.push("from the UI.");
  }
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

  lines.push(...evalSection(o));

  lines.push(...passwordSection(o));

  lines.push(...oauthSection(o));

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

  lines.push("## Voice", "");
  lines.push("Answers can be read aloud. The speaker button in the composer turns it on, and");
  lines.push("each answer is spoken sentence by sentence as it streams. It uses the browser's");
  lines.push("own speech synthesis — no API key, no request leaves the page, nothing is");
  lines.push("charged — so the available voices are whatever the operating system provides.");
  lines.push("The button is hidden entirely on a browser with no voice installed. The choice");
  lines.push("is remembered per device rather than per account, so enabling it on a phone");
  lines.push("does not make a shared desktop start talking. A snap- or flatpak-confined");
  lines.push("browser (Ubuntu's default Chromium install, notably) can't reach the system's");
  lines.push("speech engine and reports no voices either — install a distribution-packaged");
  lines.push("browser to get the button back.");
  lines.push("");
  lines.push("Questions can be asked by voice too. The microphone button records, stops");
  lines.push("itself after about a second and a half of silence (or at a hard 60-second cap,");
  lines.push("or when you press it again), and sends what it heard as the next message. If");
  lines.push("it hears no speech at all, or the provider comes back with nothing usable, it");
  lines.push("says so instead of sending anything. Unlike spoken answers this costs money and");
  lines.push("needs a key: transcription runs on the server through Google or OpenAI —");
  lines.push("Anthropic and Ollama have no speech API at all — chosen under **Admin →");
  lines.push("Settings → Models**, with its own rate limit under **Answering**. The button");
  lines.push("is absent entirely when no capable provider is configured, and on a browser");
  lines.push("that cannot record.");
  lines.push("");

  return lines.join("\n");
}

// Rendered instead of generateFullAppReadme when appKind === "api": there is no
// Next.js, no admin UI, and no browser-facing pages at all in that build (see
// scaffold.ts's API_ONLY_DELETE_PATHS) — every one of those workflows is
// re-explained here purely in terms of the JSON API a consumer's own frontend
// would call.
function generateApiOnlyReadme(o: InstallOptions): string {
  const store = VECTOR_STORES[o.vectorStore];
  const providerLabels = o.providers.map((p) => PROVIDERS[p].label);

  const lines: string[] = [];

  lines.push(`# ${o.projectName}`, "");
  lines.push(
    "A headless Retrieval-Augmented Generation (RAG) API (standalone Hono server, " +
      "Auth.js-compatible session tokens, Drizzle + Postgres) generated with " +
      "`rag-boilerplate` in **api-only** mode.",
    "",
  );
  lines.push(
    "There is no frontend, no admin UI, and no Next.js anywhere in this project — " +
      "every feature below is a JSON endpoint. Bring your own client (web, mobile, " +
      "CLI, whatever) and call it directly.",
    "",
  );

  lines.push("## Stack", "");
  lines.push(`- **AI providers:** ${providerLabels.join(", ")}`);
  lines.push(`- **Vector store:** ${store.label}`);
  lines.push("- **Server:** standalone Hono (`src/server/`) — no Next.js in this build");
  lines.push("");

  lines.push("## Getting started", "");
  let step = 1;
  lines.push(
    `${step++}. \`npm install\` (skip this if the installer already installed dependencies for you). ` +
      "This project ships a `package-lock.json` pinning the dependency versions the " +
      "boilerplate was tested against. npm reads it, while pnpm, yarn and bun each " +
      "resolve their own lockfile instead and ignore this one. It may be absent if the " +
      "scaffolder could not reconcile it against your selection (no network at scaffold " +
      "time, for example) — npm then resolves fresh, same as the other package managers.",
  );
  lines.push(
    `${step++}. \`.env\` is already generated with a fresh \`AUTH_SECRET\` / \`SETTINGS_ENCRYPTION_KEY\`; ` +
      "set provider API keys via `PUT /api/admin/settings` (there is no admin UI here — see " +
      "**Authentication** below for how to call it as the admin). Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` " +
      "in `.env` if you want non-default admin credentials.",
  );
  const composeCmd = `docker compose up -d db minio${store.dockerService ? ` ${store.dockerService}` : ""}`;
  lines.push(
    `${step++}. Start services: \`${composeCmd}\` (Postgres + MinIO for image storage, plus the selected ` +
      "self-hosted store if any; Pinecone is managed → no extra service).",
  );
  for (const s of hostMigrationSteps(o, store)) lines.push(`${step++}. ${s}`);
  lines.push(
    `${step++}. \`npm run dev\` → http://localhost:3000 (no browser UI to visit — try ` +
      "`curl http://localhost:3000/api/health`).",
  );
  lines.push("");

  const notes: string[] = [];
  if (o.vectorStore === "qdrant") notes.push("- Run under Node 20/22 LTS (the Qdrant client breaks on Node ≥ 26).");
  if (o.vectorStore === "pinecone") notes.push("- Create a Pinecone account and set `PINECONE_API_KEY` in `.env` before running `vectorstore:init`.");
  if (notes.length > 0) lines.push("### Notes", "", ...notes, "");

  lines.push("## Authentication", "");
  lines.push("There is no NextAuth sign-in page in this build — exchange credentials for a bearer token:", "");
  lines.push("```bash");
  lines.push("curl -X POST http://localhost:3000/api/auth/login \\");
  lines.push('  -H "Content-Type: application/json" \\');
  lines.push("  -d '{\"email\":\"admin@example.com\",\"password\":\"change-me-please\"}'");
  lines.push('# -> { "token": "..." }');
  lines.push("```");
  lines.push("");
  lines.push(
    "Send that token as `Authorization: Bearer <token>` on every subsequent request. It is minted with " +
      "the exact same JWT shape and secret the full-app build's Auth.js session cookie uses, so it is " +
      "accepted by every route that checks the session — `/api/chat`, `/api/conversations`, `/api/admin/**`, " +
      "and so on.",
  );
  lines.push("");

  lines.push("## Registration", "");
  lines.push(
    "Self-registration works the same way as the full app: `POST /api/register` (email only) only " +
      "succeeds if the domain is allowed and the mailbox owner clicks the emailed verification link. " +
      "Nobody can log in until they do.",
    "",
  );
  lines.push(
    "**This build ships no `/verify` page of its own**, so set `VERIFY_URL` in `.env` to your own " +
      "frontend's \"choose a password\" screen (e.g. `https://your-app.example.com/verify`) — the emailed " +
      "link becomes `${VERIFY_URL}?token=...`. Without `VERIFY_URL`, the link falls back to `AUTH_URL` (or " +
      "the request's own origin in dev) plus `/verify`, a route that does not exist in this build.",
    "",
  );
  lines.push("Your frontend reads the `token` query param from that link and finishes registration with:", "");
  lines.push("```bash");
  lines.push("curl -X POST http://localhost:3000/api/auth/verify \\");
  lines.push('  -H "Content-Type: application/json" \\');
  lines.push("  -d '{\"token\":\"...\",\"password\":\"...\"}'");
  lines.push("```");
  lines.push("");
  lines.push(
    "SMTP must be configured (via `PUT /api/admin/settings`) before registration works — until then it " +
      "returns 503. The allowed-domains list lives in the same settings and **denies everyone when empty**, " +
      "deliberately; `npm run seed:admin` seeds it from `ADMIN_EMAIL`'s domain, so a fresh install already " +
      "has a working allowlist. The confirmation link expires in 24 hours.",
  );
  lines.push("");
  lines.push("Email addresses are stored and matched in lower case.");
  // Same reasoning as generateFullAppReadme's version of this paragraph: only a
  // pgvector-store project ships migration 0020 (every other store's drizzle/
  // is deleted and regenerated as DDL-only via `npm run db:generate`, with no
  // historical data migration to repair anything), so this only appears there.
  if (o.vectorStore === "pgvector") {
    lines.push(
      "If you are upgrading an install that ran 0.5.8, migration 0020 repairs accounts that OAuth forked: " +
        "the confirmed row keeps the address and any duplicate is renamed to `name+dup-xxxxxxxx@domain` and " +
        "blocked, for you to review with `GET /api/admin/users`. Nothing is deleted — but note that chats " +
        "made under a forked account stay in the database and are no longer reachable from the API.",
    );
  }
  lines.push("");

  lines.push("## Rate limits", "");
  lines.push(
    "On by default: 20 chat requests/minute and 200/day per user, enforced the moment `db:migrate` runs. " +
      "Set either to `0` via `PUT /api/admin/settings` to disable it. This bounds one account, not your " +
      "total spend — combine it with the registration gate above.",
  );
  lines.push("");
  lines.push(
    "Voice transcription has its own pair — `transcribeRateLimitPerMinute` and " +
      "`transcribeRateLimitPerDay`, defaulting to 10/minute and 100/day per user, set through the same " +
      "`PUT /api/admin/settings`. It is a second budget rather than a share of the chat one: transcription " +
      "is billed per second of audio, not per token, and a spoken question spends one of each. `0` disables.",
  );
  lines.push("");

  lines.push("## Speech to text", "");
  lines.push(
    "There is no browser in this build, but the endpoint the full app's microphone posts to ships here too — " +
      "point your own frontend at it.",
  );
  lines.push("");
  lines.push("| Endpoint | Purpose |");
  lines.push("| --- | --- |");
  lines.push(
    "| `POST /api/chat/transcribe` | `multipart/form-data` with one `audio` part. Answers `{ \"text\": \"...\" }`. " +
      "The part's own content type must be one of `audio/webm`, `audio/mp4`, `audio/ogg`, `audio/wav` or " +
      "`audio/mpeg` (a `;codecs=` parameter is fine and is stripped) — anything else is `415`. Over 10 MB is " +
      "`413`, over the rate limit is `429`, no speech-capable provider configured is `503`, and a provider " +
      "that itself failed is `502`. |",
  );
  lines.push(
    // No pipe anywhere in this cell, deliberately. GFM splits table cells on
    // every unescaped `|`, INCLUDING one inside a code span, and discards the
    // cells past the header's column count — so `true|false` here silently ate
    // the whole rest of the row in every generated README. `\|` would work, but
    // it is invisible to anyone rewording this later; a cell with no pipe in it
    // cannot regress the same way.
    "| `GET /api/chat/transcribe` | Answers `{ \"available\": true }` when transcription can be served at " +
      "all right now (a speech-capable provider selected, with a model and a key), and `false` otherwise. " +
      "Call it once to decide whether to show a microphone in your own UI, rather than discovering the " +
      "`503` after the user has already spoken. |",
  );
  lines.push("");
  lines.push(
    "`text` comes back empty when nothing intelligible was heard — a silent clip, or a model that answered " +
      "the audio instead of transcribing it. Treat empty as \"nothing was said\" and send nothing; do NOT " +
      "post it as a message. Only Google and OpenAI can transcribe; Anthropic and Ollama have no speech API " +
      "at all, so a project scaffolded without either ships this endpoint permanently at `503`.",
  );
  lines.push("");

  lines.push("## Workspaces & images", "");
  lines.push(
    "Workspaces scope what the assistant can see (every user always has access to **General**); images are " +
      "captioned by a vision model and retrieved the same way documents are. Both are managed entirely " +
      "through `/api/admin/workspaces` and `/api/admin/images`/`/api/admin/documents` — there is no admin " +
      "screen here, so `/docs` (see below) is the fastest way to see the full contract for each.",
  );
  lines.push("");

  lines.push("## Ingesting & inspecting documents", "");
  lines.push(
    "Upload a file with `POST /api/admin/documents` (multipart, same as the full app), or ingest a web page " +
      "directly with `POST /api/admin/documents/url` — send `{ \"url\": \"https://example.com/article\" }` and " +
      "it fetches the page, extracts the readable article text (no file, no extension), and ingests it exactly " +
      "like an upload. Both return the new `documentId` with `status: \"processing\"` immediately; chunking and " +
      "embedding continue in the background.",
  );
  lines.push("");
  lines.push(
    "Preview how a document was chunked with `GET /api/admin/documents/{id}/chunks?limit=&offset=` — each row " +
      "carries its position in the document and its character count. With no admin UI in this build, this " +
      "endpoint is the only way to inspect chunking; chunks ingested before position tracking was added come " +
      "back with a null position rather than being renumbered to hide the gap.",
  );
  lines.push("");

  lines.push("## API docs", "");
  lines.push(
    "An interactive API reference is served at `/docs` (Scalar, self-hosted, no CDN), backed by the raw " +
      "OpenAPI document at `/api/openapi.json`. Both are public (not gated behind login) — with no admin UI " +
      "in this build, `/docs` is the closest thing to one: every route this server exposes, in one place.",
  );
  lines.push("");

  lines.push("## Secrets", "");
  lines.push("Your `.env` was generated with two fresh secrets — you do not need to create them:", "");
  lines.push("- `AUTH_SECRET` — signs the session tokens `POST /api/auth/login` issues.");
  lines.push("- `SETTINGS_ENCRYPTION_KEY` — the AES-256-GCM master key that encrypts the");
  lines.push("  provider API keys saved via `PUT /api/admin/settings`, so they are never stored in");
  lines.push("  plaintext in the database. It must decode to exactly 32 bytes.", "");
  lines.push("**Do not change `SETTINGS_ENCRYPTION_KEY` after you have saved provider keys** —");
  lines.push("the stored keys are encrypted with it and would become unreadable; you would have");
  lines.push("to re-enter them. Keep `.env` out of version control (it already is), and set both");
  lines.push("secrets as real environment variables when you deploy. To generate one yourself:", "");
  lines.push("```bash");
  lines.push("openssl rand -base64 32");
  lines.push("```");
  lines.push("");

  lines.push(...evalSection(o));

  lines.push(...passwordSection(o));

  lines.push(...oauthSection(o));

  lines.push("## Deploying", "");
  lines.push(
    "The app ships as a Docker image with no build stage of its own: the server runs its TypeScript " +
      "source directly via `tsx` (which also resolves this project's `@/*` path aliases from " +
      "`tsconfig.json`). To run the whole stack — Postgres, MinIO and the server itself:",
    "",
  );
  lines.push("```bash");
  lines.push("docker compose --profile app up --build");
  lines.push("```");
  lines.push("");
  lines.push(
    "Local development is unaffected: without `--profile app`, `docker compose up -d db minio` still " +
      "starts only the dependencies.",
    "",
  );
  lines.push(
    "The `app` service's `environment:` block overrides the `localhost` URLs `.env` carries for Postgres, " +
      "object storage, and the selected vector store (if it runs its own container) with their in-network " +
      "service names — inside the container, `localhost` means the container itself, not its neighbors. " +
      "Keep those overrides if you edit the compose file.",
    "",
  );
  lines.push("**The container does not run migrations.** Run these from the host against the database before", "the first start:", "");
  for (const s of hostMigrationSteps(o, store)) lines.push(`- ${s}`);
  lines.push("");
  lines.push(
    "`GET /api/health` returns 200 when Postgres is reachable and 503 when it is not; Docker's healthcheck " +
      "uses it. Outside Docker, `npm run build` type-checks (there is nothing to bundle) and `npm run start` " +
      "runs the server once, without the file-watcher `dev` uses. When deploying outside compose, pass " +
      "`DATABASE_URL`, `AUTH_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `VERIFY_URL` (see **Registration** above) " +
      "and the `S3_*` variables as real environment variables — `.env` is never baked into the image.",
  );
  lines.push("");

  return lines.join("\n");
}
