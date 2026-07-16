import { cp, rm, rename, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { InstallOptions } from "./options.js";
import { PROVIDER_IDS, VECTOR_STORE_IDS, resolveEmbeddingProvider } from "./options.js";
import { PROVIDERS, VECTOR_STORES, providerDepsToRemove } from "./modules.js";
import { prunePackageJson, removeTestTooling, pruneDockerCompose, pruneEnvExampleStores, generateEnv, generateSecret, setDbImage } from "./transforms/config.js";
import { applySourceTransforms } from "./transforms/source.js";
import { generateReadme } from "./readme.js";

// Compute the ten settings defaults from the chosen default provider + manifest.
export function settingsDefaultsFor(o: InstallOptions) {
  const chat = PROVIDERS[o.defaultProvider];
  const embProvider = resolveEmbeddingProvider(o.providers, o.defaultProvider);
  const emb = PROVIDERS[embProvider];
  return {
    chatProvider: o.defaultProvider, chatModel: chat.defaultChatModel,
    embeddingProvider: embProvider, embeddingModel: emb.defaultEmbeddingModel!,
    parserProvider: o.defaultProvider, parserModel: chat.defaultVisionModel,
    imageProvider: o.defaultProvider, imageModel: chat.defaultVisionModel,
    unifiedProvider: o.defaultProvider, unifiedModel: chat.defaultChatModel,
  };
}

export async function scaffold(o: InstallOptions, opts: { templateDir: string; targetDir: string }): Promise<void> {
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

  // 9. Generate a README tailored to this selection (the template ships none).
  await writeFile(join(opts.targetDir, "README.md"), generateReadme(o));
}
