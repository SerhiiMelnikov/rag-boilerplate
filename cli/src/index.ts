#!/usr/bin/env node
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as p from "@clack/prompts";
import { parseArgs, PROVIDER_IDS, VECTOR_STORE_IDS, type ProviderId, type VectorStoreId } from "./options.js";
import { PROVIDERS, VECTOR_STORES } from "./modules.js";
import { resolveOptions, type Prompter } from "./prompts.js";
import { scaffold } from "./scaffold.js";
import { runPostInstall, nextSteps } from "./postinstall.js";

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = join(here, "..", "template");

// Interactive prompter backed by @clack/prompts.
const clackPrompter: Prompter = {
  askProjectName: async () => String(await p.text({ message: "Project name", defaultValue: "my-rag-app", placeholder: "my-rag-app" })),
  askProviders: async () => (await p.multiselect({ message: "AI providers", options: PROVIDER_IDS.map((id) => ({ value: id, label: PROVIDERS[id].label })), initialValues: ["google"] as ProviderId[], required: true })) as ProviderId[],
  askDefaultProvider: async (providers) => (await p.select({ message: "Default provider", options: providers.map((id) => ({ value: id, label: PROVIDERS[id].label })) })) as ProviderId,
  askVectorStore: async () => (await p.select({ message: "Vector store", options: VECTOR_STORE_IDS.map((id) => ({ value: id, label: VECTOR_STORES[id].label })) })) as VectorStoreId,
  askPostActions: async () => ({ git: Boolean(await p.confirm({ message: "Initialize a git repo?" })), install: Boolean(await p.confirm({ message: "Install dependencies?" })) }),
};

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  p.intro("rag-boilerplate");
  const options = await resolveOptions(cli, clackPrompter);
  const targetDir = resolve(process.cwd(), options.projectName);
  await scaffold(options, { templateDir, targetDir });
  runPostInstall(options, targetDir, (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "inherit" }));
  p.note(nextSteps(options).join("\n"), "Next steps");
  p.outro("Done.");
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
