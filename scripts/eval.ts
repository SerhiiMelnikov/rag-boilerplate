import "dotenv/config";
import { getRuntimeSettings } from "@/lib/config/settings-service";
import { runEvalCli } from "@/lib/eval/cli";

// Thin entry point on purpose: all logic lives in src/lib/eval/cli.ts, where it can
// be unit tested without a database. Keep this file to wiring only.
async function main() {
  const code = await runEvalCli(process.argv.slice(2), {
    getSettings: getRuntimeSettings,
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
  process.exit(code);
}

void main();
