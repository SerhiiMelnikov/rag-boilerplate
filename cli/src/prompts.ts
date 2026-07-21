import type { InstallOptions, ProviderId, VectorStoreId, AppKind, PackageManager } from "./options.js";
import { validateSelection, detectPackageManager } from "./options.js";

export interface Prompter {
  askProjectName(): Promise<string>;
  askProviders(): Promise<ProviderId[]>;
  askDefaultProvider(providers: ProviderId[]): Promise<ProviderId>;
  askVectorStore(): Promise<VectorStoreId>;
  askAppKind(): Promise<AppKind>;
  askPostActions(): Promise<{ git: boolean; install: boolean }>;
}

// Merge CLI flags with prompted answers into a validated InstallOptions.
// With `yes`, unspecified fields take defaults and the prompter is not consulted
// beyond a required project name.
export async function resolveOptions(cli: Partial<InstallOptions> & { yes: boolean }, ask: Prompter): Promise<InstallOptions> {
  const projectName = cli.projectName ?? (await ask.askProjectName());
  const providers = cli.providers ?? (cli.yes ? (["google"] as ProviderId[]) : await ask.askProviders());
  const vectorStore = cli.vectorStore ?? (cli.yes ? ("pgvector" as VectorStoreId) : await ask.askVectorStore());
  const defaultProvider = cli.defaultProvider ?? (providers.length === 1 ? providers[0] : cli.yes ? providers[0] : await ask.askDefaultProvider(providers));
  const appKind = cli.appKind ?? (cli.yes ? ("full" as AppKind) : await ask.askAppKind());
  const post = cli.yes ? { git: cli.git ?? true, install: cli.install ?? true } : await ask.askPostActions();
  const packageManager: PackageManager = cli.packageManager ?? detectPackageManager(process.env.npm_config_user_agent);

  const errors = validateSelection({ providers, defaultProvider, vectorStore, appKind });
  if (errors.length) throw new Error(errors.join(" "));

  return { projectName, providers, defaultProvider, vectorStore, appKind, git: cli.git ?? post.git, install: cli.install ?? post.install, packageManager, yes: cli.yes };
}
