import type { InstallOptions } from "./options.js";
import { PROVIDERS, VECTOR_STORES } from "./modules.js";

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
  lines.push("1. `npm install` (skip this if the installer already installed dependencies for you)");
  lines.push(
    "2. `.env` is already generated with a fresh `AUTH_SECRET` / `SETTINGS_ENCRYPTION_KEY`; " +
      "set provider API keys later in the admin UI (admin → Provider keys). Set " +
      "`ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` if you want non-default admin credentials.",
  );
  const composeCmd = `docker compose up -d db${store.dockerService ? ` ${store.dockerService}` : ""}`;
  lines.push(
    `3. Start services: \`${composeCmd}\` (Postgres, plus the selected self-hosted store if any; ` +
      "Pinecone is managed → just `db`).",
  );
  lines.push("4. `npm run db:migrate`");
  lines.push("5. `npm run seed:admin`");
  let step = 6;
  if (store.initNeeded) lines.push(`${step++}. \`npm run vectorstore:init\``);
  lines.push(`${step++}. \`npm run dev\` → http://localhost:3000`);
  lines.push("");

  const notes: string[] = [];
  if (o.vectorStore === "qdrant") notes.push("- Run under Node 20/22 LTS (the Qdrant client breaks on Node ≥ 26).");
  if (o.vectorStore === "pinecone") notes.push("- Create a Pinecone account and set `PINECONE_API_KEY` in `.env` before running `vectorstore:init`.");
  if (notes.length > 0) {
    lines.push("### Notes", "", ...notes, "");
  }

  lines.push("## Admin", "");
  lines.push("Under the admin menu you can:");
  lines.push("- Upload documents");
  lines.push("- Set provider keys");
  lines.push("- Tune settings");
  lines.push("- View rating analytics");
  lines.push("");

  return lines.join("\n");
}
