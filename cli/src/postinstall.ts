import type { InstallOptions, PackageManager } from "./options";
import { VECTOR_STORES } from "./modules";

export function installCommand(pm: PackageManager): string[] {
  if (pm === "yarn") return ["yarn"];
  return [pm, "install"];
}

// Tailored setup steps printed after scaffolding.
export function nextSteps(o: InstallOptions): string[] {
  const steps: string[] = [`cd ${o.projectName}`, "npm run db:up", "npm run db:migrate", "npm run seed:admin"];
  if (VECTOR_STORES[o.vectorStore].initNeeded) steps.push("npm run vectorstore:init");
  steps.push("npm run dev");
  if (o.vectorStore === "qdrant") steps.push("Note: the Qdrant client requires Node 20/22 LTS (it breaks on Node >= 26).");
  if (o.vectorStore === "pinecone") steps.push("Note: create a Pinecone account and set PINECONE_API_KEY in .env before `vectorstore:init`.");
  return steps;
}

// Run git init + dependency install via an injected runner (child_process in prod).
export function runPostInstall(o: InstallOptions, targetDir: string, run: (cmd: string, args: string[], cwd: string) => void): void {
  if (o.git) {
    run("git", ["init"], targetDir);
    run("git", ["add", "-A"], targetDir);
    run("git", ["commit", "-m", "Initial commit from rag-boilerplate"], targetDir);
  }
  if (o.install) {
    const [cmd, ...args] = installCommand(o.packageManager);
    run(cmd, args, targetDir);
  }
}
