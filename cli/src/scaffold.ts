import { cp, rm, rename, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import type { InstallOptions } from "./options.js";
import { PROVIDER_IDS, VECTOR_STORE_IDS, resolveEmbeddingProvider, resolveSpeechProvider } from "./options.js";
import { PROVIDERS, VECTOR_STORES, providerDepsToRemove, API_ONLY_REMOVE_DEPS, FULL_APP_REMOVE_DEPS } from "./modules.js";
import { prunePackageJson, removeTestTooling, pruneDockerCompose, pruneEnvExampleStores, generateEnv, generateSecret, setDbImage, setAppEnvOverrides, rewriteScriptsForApiOnly, removeServerScripts } from "./transforms/config.js";
import { applySourceTransforms } from "./transforms/source.js";
import { generateReadme } from "./readme.js";
import { API_ONLY_DOCKERFILE } from "./docker.js";

// Paths deleted for appKind === "api": everything Next.js/React-only. Deleting
// src/app/ also covers src/app/globals.css, so that file needs no separate entry.
// Every extension a given config file could plausibly ship under is listed —
// existsSync guards each one, so an absent variant (or an already-pruned path,
// e.g. a second scaffold() call) is a silent no-op, never an error.
const API_ONLY_DELETE_PATHS = [
  "src/app",
  "middleware.ts",
  "next.config.ts", "next.config.js", "next.config.mjs",
  "next-env.d.ts",
  "tailwind.config.ts", "tailwind.config.js",
  "postcss.config.mjs", "postcss.config.js", "postcss.config.ts",
  "src/components",
  "src/auth.ts",
  "src/auth.config.ts",
  "src/types/next-auth.d.ts",
  // sentences.ts and speakable-text.ts are plain string functions, not browser-only
  // themselves — but this module exists solely to feed the browser speech toggle in
  // src/components/chat, which is already deleted above. Left in place, it would
  // ship as dead code with nothing in an api-only build ever importing it.
  "src/lib/voice",
];

// Compute the up-to-twelve settings defaults from the chosen default provider + manifest.
export function settingsDefaultsFor(o: InstallOptions) {
  const chat = PROVIDERS[o.defaultProvider];
  const embProvider = resolveEmbeddingProvider(o.providers, o.defaultProvider);
  const emb = PROVIDERS[embProvider];
  const speechProvider = resolveSpeechProvider(o.providers, o.defaultProvider);
  return {
    chatProvider: o.defaultProvider, chatModel: chat.defaultChatModel,
    embeddingProvider: embProvider, embeddingModel: emb.defaultEmbeddingModel!,
    parserProvider: o.defaultProvider, parserModel: chat.defaultVisionModel,
    imageProvider: o.defaultProvider, imageModel: chat.defaultVisionModel,
    unifiedProvider: o.defaultProvider, unifiedModel: chat.defaultChatModel,
    // null when the selection keeps no speech-capable provider.
    speechProvider, speechModel: speechProvider ? PROVIDERS[speechProvider].defaultSpeechModel : null,
  };
}

// `--package-lock-only` rewrites the lockfile to match package.json without touching
// node_modules: entries for pruned dependencies go, and the resolved versions of
// everything retained stay exactly as this repository tests them. `--ignore-scripts`
// because nothing should execute during a scaffold.
async function reconcileLockfile(dir: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile(
      "npm",
      ["install", "--package-lock-only", "--ignore-scripts"],
      { cwd: dir },
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

export async function scaffold(o: InstallOptions, opts: { templateDir: string; targetDir: string; reconcileLockfile?: (dir: string) => Promise<void> }): Promise<void> {
  // 1. Copy the template.
  await cp(opts.templateDir, opts.targetDir, { recursive: true });
  // 2. _gitignore -> .gitignore
  const gi = join(opts.targetDir, "_gitignore");
  if (existsSync(gi)) await rename(gi, join(opts.targetDir, ".gitignore"));

  const removedProviders = PROVIDER_IDS.filter((p) => !o.providers.includes(p));
  const removedStores = VECTOR_STORE_IDS.filter((s) => s !== o.vectorStore);
  const cutPgvector = o.vectorStore !== "pgvector";

  // 3. Delete pruned provider adapter files + pruned vector-store dirs.
  for (const p of removedProviders) {
    const f = join(opts.targetDir, PROVIDERS[p].file);
    if (existsSync(f)) await rm(f, { force: true });
  }
  for (const s of removedStores) {
    const dir = VECTOR_STORES[s].dir ? join(opts.targetDir, VECTOR_STORES[s].dir!) : null;
    if (dir && existsSync(dir)) await rm(dir, { recursive: true, force: true });
  }

  // 4. package.json deps: prune unselected provider/store deps, then strip the
  // template's own test scripts + test-only devDependencies (no test files ship).
  const pkgPath = join(opts.targetDir, "package.json");
  const removeDeps = [...providerDepsToRemove(o.providers), ...removedStores.flatMap((s) => VECTOR_STORES[s].deps)];
  const pkgJson = removeTestTooling(prunePackageJson(await readFile(pkgPath, "utf8"), removeDeps));
  await writeFile(pkgPath, pkgJson);

  // 5. docker-compose: keep db + minio/createbuckets (always, for image storage)
  // + the selected store's service (if any). When the chosen store is not
  // pgvector, downgrade the db image to plain Postgres.
  const dcPath = join(opts.targetDir, "docker-compose.yml");
  if (existsSync(dcPath)) {
    // "app" ships in every generated project: it is the documented Docker
    // deployment path (docker compose --profile app up --build). Omit it here and
    // pruneDockerCompose deletes the service from the user's compose file.
    const keep = ["db", "minio", "createbuckets", "app", VECTOR_STORES[o.vectorStore].dockerService].filter((s): s is string => !!s);
    let dc = pruneDockerCompose(await readFile(dcPath, "utf8"), keep);
    if (cutPgvector) dc = setDbImage(dc, "postgres:16");
    // Point the app service at the chosen store's in-network host (see the
    // localhost-trap comment already on DATABASE_URL/S3_ENDPOINT in the
    // template's compose file); a no-op for pgvector/pinecone.
    dc = setAppEnvOverrides(dc, VECTOR_STORES[o.vectorStore].appEnvOverrides);
    await writeFile(dcPath, dc);
  }

  // 6. .env.example store blocks.
  const envExPath = join(opts.targetDir, ".env.example");
  if (existsSync(envExPath)) await writeFile(envExPath, pruneEnvExampleStores(await readFile(envExPath, "utf8"), o.vectorStore));

  // 7. Source transforms (factories, unions, admin lists, schema defaults).
  // applySourceTransforms derives its own removed-providers/-stores lists from
  // the kept sets, so only the kept sets + settings defaults are passed here.
  await applySourceTransforms(opts.targetDir, {
    keptProviders: o.providers,
    keptStores: [o.vectorStore],
    settingsDefaults: settingsDefaultsFor(o),
    cutPgvector,
  });

  // 7b. Non-pgvector projects generate migrations from their own pruned schema
  // via `npm run db:generate`; the shipped pgvector migrations do not apply.
  if (cutPgvector) {
    const drizzleDir = join(opts.targetDir, "drizzle");
    if (existsSync(drizzleDir)) await rm(drizzleDir, { recursive: true, force: true });
  }

  // 8. Generate .env with fresh secrets.
  await writeFile(join(opts.targetDir, ".env"), generateEnv({ vectorStore: o.vectorStore }, { authSecret: generateSecret(), encryptionKey: generateSecret() }));

  // 8b. appKind branch: api-only prunes the Next.js/React frontend down to a
  // standalone Hono server (src/server/, already shipped in the template);
  // full removes that standalone server instead, since it is the Next.js app
  // that actually gets served. This used to have to run after step 7's
  // applySourceTransforms, which needed src/components/admin/*.tsx to still
  // exist; that transform now edits src/lib/providers/catalog.ts and a handful
  // of other src/lib files instead (verified: reordering the two does not
  // break the scaffold or installer.integration tests). Left in this position
  // to match the numbered steps above, not because of a live dependency.
  if (o.appKind === "api") {
    for (const rel of API_ONLY_DELETE_PATHS) {
      const p = join(opts.targetDir, rel);
      if (existsSync(p)) await rm(p, { recursive: true, force: true });
    }
    const apiPkg = prunePackageJson(await readFile(pkgPath, "utf8"), API_ONLY_REMOVE_DEPS);
    await writeFile(pkgPath, rewriteScriptsForApiOnly(apiPkg));

    const dockerfilePath = join(opts.targetDir, "Dockerfile");
    if (existsSync(dockerfilePath)) await writeFile(dockerfilePath, API_ONLY_DOCKERFILE);
  } else {
    const serverDir = join(opts.targetDir, "src/server");
    if (existsSync(serverDir)) await rm(serverDir, { recursive: true, force: true });

    const fullPkg = prunePackageJson(await readFile(pkgPath, "utf8"), FULL_APP_REMOVE_DEPS);
    await writeFile(pkgPath, removeServerScripts(fullPkg));
  }

  // 8c. The template ships this repo's own lockfile, so npm users inherit the exact
  // dependency tree these tests run against — transitives included. It must be
  // reconciled against the pruned package.json first: `npm ci` (which the generated
  // Dockerfile runs) fails hard on a mismatch. If that cannot be done, DELETE the
  // lockfile. A missing one is globbed as optional and breaks nothing; a mismatched
  // one breaks every Docker build. Scaffolding never fails because of this step.
  const lockPath = join(opts.targetDir, "package-lock.json");
  if (existsSync(lockPath)) {
    try {
      await (opts.reconcileLockfile ?? reconcileLockfile)(opts.targetDir);
    } catch {
      await rm(lockPath, { force: true });
    }
  }

  // 9. Generate a README tailored to this selection (the template ships none).
  await writeFile(join(opts.targetDir, "README.md"), generateReadme(o));
}
