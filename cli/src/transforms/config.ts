import { randomBytes } from "node:crypto";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { VectorStoreId } from "../options.js";
import { VECTOR_STORES } from "../modules.js";

// Remove the given dependency names from package.json (dependencies + devDependencies).
export function prunePackageJson(json: string, removeDeps: string[]): string {
  const pkg = JSON.parse(json);
  for (const section of ["dependencies", "devDependencies"] as const) {
    if (!pkg[section]) continue;
    for (const dep of removeDeps) delete pkg[section][dep];
  }
  return JSON.stringify(pkg, null, 2) + "\n";
}

const TEST_DEV_DEPS = ["@testing-library/dom", "@testing-library/jest-dom", "@testing-library/react", "@testing-library/user-event", "@vitejs/plugin-react", "jsdom", "vitest"];
const TEST_SCRIPTS = ["test", "test:watch", "test:integration"];

// Remove the boilerplate's own test scripts + test-only devDependencies from the
// generated package.json (the scaffolded app ships without the template's tests).
export function removeTestTooling(json: string): string {
  const pkg = JSON.parse(json);
  if (pkg.scripts) for (const s of TEST_SCRIPTS) delete pkg.scripts[s];
  if (pkg.devDependencies) for (const d of TEST_DEV_DEPS) delete pkg.devDependencies[d];
  return JSON.stringify(pkg, null, 2) + "\n";
}

// Keep only the named services; drop any top-level volume no longer referenced.
export function pruneDockerCompose(yamlText: string, keepServices: string[]): string {
  const doc = parseYaml(yamlText) as { services?: Record<string, unknown>; volumes?: Record<string, unknown> };
  const keep = new Set(keepServices);
  if (doc.services) {
    for (const name of Object.keys(doc.services)) if (!keep.has(name)) delete doc.services[name];
  }
  // Collect volumes still referenced by the surviving services.
  const used = new Set<string>();
  for (const svc of Object.values(doc.services ?? {})) {
    const vols = (svc as { volumes?: string[] }).volumes ?? [];
    for (const v of vols) used.add(String(v).split(":")[0]);
  }
  if (doc.volumes) {
    for (const name of Object.keys(doc.volumes)) if (!used.has(name)) delete doc.volumes[name];
    if (Object.keys(doc.volumes).length === 0) delete doc.volumes;
  }
  return stringifyYaml(doc);
}

// Rewrite the `db` service image. Used when the chosen vector store keeps its
// vectors elsewhere, so a plain Postgres image (no pgvector) suffices.
export function setDbImage(yamlText: string, image: string): string {
  const doc = parseYaml(yamlText) as { services?: Record<string, { image?: string }> };
  if (doc.services?.db) doc.services.db.image = image;
  return stringifyYaml(doc);
}

// Merge env vars into the `app` service's `environment:` block. Used so the
// chosen vector store's URL addresses its in-network docker-compose service
// name rather than the `localhost` value generateEnv() wrote into .env — the
// same trap DATABASE_URL/S3_ENDPOINT are already overridden for. A null/empty
// `overrides` (pgvector, pinecone) is a no-op that leaves the YAML untouched,
// so it never pays the parse/stringify round trip (which drops comments) when
// there is nothing to change.
export function setAppEnvOverrides(yamlText: string, overrides: Record<string, string> | null): string {
  if (!overrides || Object.keys(overrides).length === 0) return yamlText;
  const doc = parseYaml(yamlText) as { services?: Record<string, { environment?: Record<string, unknown> }> };
  const app = doc.services?.app;
  if (!app) return yamlText;
  app.environment = { ...(app.environment ?? {}), ...overrides };
  return stringifyYaml(doc);
}

// Remove every store's .env block except the chosen one. Blocks start at a
// `# --- <Store> ...` header and run until the next such header or EOF.
export function pruneEnvExampleStores(text: string, keepStore: VectorStoreId): string {
  const headers = Object.values(VECTOR_STORES).map((m) => m.envHeader).filter((h): h is string => !!h);
  const keepHeader = VECTOR_STORES[keepStore].envHeader;
  const lines = text.split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const isHeader = /^#\s*---\s/.test(line) && headers.some((h) => line.includes(h));
    if (isHeader) {
      const thisHeader = headers.find((h) => line.includes(h))!;
      skipping = thisHeader !== keepHeader;
    } else if (/^#\s*---\s/.test(line)) {
      skipping = false; // a non-store `# --- ...` header ends any skip
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n");
}

export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64");
}

// Build the generated project's .env. DATABASE_URL/ADMIN_* mirror .env.example
// defaults; secrets are freshly generated; store-specific vars are appended.
export function generateEnv(o: { vectorStore: VectorStoreId }, secrets: { authSecret: string; encryptionKey: string }): string {
  const lines = [
    "DATABASE_URL=postgres://rag:rag@localhost:5432/rag",
    "ADMIN_EMAIL=admin@example.com",
    "ADMIN_PASSWORD=change-me-please",
    `AUTH_SECRET=${secrets.authSecret}`,
    `SETTINGS_ENCRYPTION_KEY=${secrets.encryptionKey}`,
    `VECTOR_STORE=${o.vectorStore}`,
    // Required in production: /api/register mints its verification link from
    // this, not from the request's Host header (see resolveAuthBase in
    // src/app/api/register/handler.ts), because a proxy that forwards Host
    // verbatim would let an attacker mint a link pointing at their own server.
    // Left commented for local `npm run dev` (NODE_ENV=development falls back
    // to the request's own origin there); uncomment and set it for any
    // production deployment, including `docker compose --profile app up`,
    // whose docker-compose.yml already sets NODE_ENV=production.
    "# AUTH_URL=http://localhost:3000",
  ];
  // Object storage (images, S3-compatible) is always present: every generated
  // project ships MinIO in docker-compose.yml, so these vars always apply.
  lines.push(
    "S3_ENDPOINT=http://localhost:9000",
    "S3_REGION=us-east-1",
    "S3_BUCKET=rag-images",
    "S3_ACCESS_KEY_ID=minioadmin",
    "S3_SECRET_ACCESS_KEY=minioadmin",
    "S3_FORCE_PATH_STYLE=true",
  );
  const store: Record<VectorStoreId, string[]> = {
    pgvector: [],
    qdrant: ["QDRANT_URL=http://localhost:6333"],
    chroma: ["CHROMA_URL=http://localhost:8000"],
    weaviate: ["WEAVIATE_URL=http://localhost:8080", "WEAVIATE_GRPC_PORT=50051"],
    pinecone: ["PINECONE_API_KEY=", "PINECONE_CLOUD=aws", "PINECONE_REGION=us-east-1"],
  };
  lines.push(...store[o.vectorStore]);
  return lines.join("\n") + "\n";
}
