import { parseArgs as nodeParseArgs } from "node:util";

export type ProviderId = "google" | "openai" | "anthropic" | "ollama";
export type VectorStoreId = "pgvector" | "qdrant" | "chroma" | "weaviate" | "pinecone";
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
// "full" = the current Next.js app (unchanged). "api" = a standalone Hono
// server with no Next.js, no React, and no admin UI at all (see scaffold.ts).
export type AppKind = "full" | "api";

export interface InstallOptions {
  projectName: string;
  providers: ProviderId[];
  defaultProvider: ProviderId;
  vectorStore: VectorStoreId;
  appKind: AppKind;
  git: boolean;
  install: boolean;
  packageManager: PackageManager;
  yes: boolean;
}

export const PROVIDER_IDS: ProviderId[] = ["google", "openai", "anthropic", "ollama"];
export const VECTOR_STORE_IDS: VectorStoreId[] = ["pgvector", "qdrant", "chroma", "weaviate", "pinecone"];
export const APP_KIND_IDS: AppKind[] = ["full", "api"];
export const EMBEDDING_CAPABLE: ProviderId[] = ["google", "openai", "ollama"];

// Parse argv into a partial option set. Missing values are filled by prompts later.
export function parseArgs(argv: string[]): Partial<InstallOptions> & { yes: boolean } {
  const { values, positionals } = nodeParseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      providers: { type: "string" },
      "vector-store": { type: "string" },
      "default-provider": { type: "string" },
      "app-kind": { type: "string" },
      install: { type: "boolean" },
      "no-install": { type: "boolean" },
      git: { type: "boolean" },
      "no-git": { type: "boolean" },
      yes: { type: "boolean", short: "y" },
    },
  });
  const out: Partial<InstallOptions> & { yes: boolean } = { yes: Boolean(values.yes) };
  if (positionals[0]) out.projectName = positionals[0];
  if (typeof values.providers === "string") {
    out.providers = values.providers.split(",").map((s) => s.trim()).filter(Boolean) as ProviderId[];
  }
  if (typeof values["vector-store"] === "string") out.vectorStore = values["vector-store"] as VectorStoreId;
  if (typeof values["default-provider"] === "string") out.defaultProvider = values["default-provider"] as ProviderId;
  if (typeof values["app-kind"] === "string") out.appKind = values["app-kind"] as AppKind;
  if (values["no-install"]) out.install = false;
  else if (values.install) out.install = true;
  if (values["no-git"]) out.git = false;
  else if (values.git) out.git = true;
  return out;
}

// Return a list of human-readable validation errors; empty means valid.
export function validateSelection(o: { providers: ProviderId[]; defaultProvider: ProviderId; vectorStore: VectorStoreId; appKind: AppKind }): string[] {
  const errors: string[] = [];
  if (o.providers.length === 0) errors.push("Select at least one provider.");
  if (o.providers.length > 0 && !o.providers.some((p) => EMBEDDING_CAPABLE.includes(p))) {
    errors.push("Select at least one embedding-capable provider (google, openai, or ollama).");
  }
  if (o.providers.length > 0 && !o.providers.includes(o.defaultProvider)) {
    errors.push("The default provider must be one of the selected providers.");
  }
  if (!VECTOR_STORE_IDS.includes(o.vectorStore)) errors.push(`Unknown vector store: ${o.vectorStore}.`);
  if (!APP_KIND_IDS.includes(o.appKind)) errors.push(`Unknown app kind: ${o.appKind}.`);
  return errors;
}

// The embedding provider used when the default provider cannot embed (anthropic):
// the first selected embedding-capable provider.
export function resolveEmbeddingProvider(providers: ProviderId[], defaultProvider: ProviderId): ProviderId {
  if (EMBEDDING_CAPABLE.includes(defaultProvider)) return defaultProvider;
  return providers.find((p) => EMBEDDING_CAPABLE.includes(p))!;
}

export function detectPackageManager(userAgent: string | undefined): PackageManager {
  const ua = userAgent ?? "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (ua.startsWith("bun")) return "bun";
  return "npm";
}
