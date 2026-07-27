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
  // On POSIX, process.stdout is asynchronous when it is a pipe (it is synchronous
  // only for a TTY or a file redirect), and process.exit() does not flush what is
  // still queued — so `npm run eval -- --json | jq`, and every CI runner, would
  // silently truncate the report at the 64 KiB pipe buffer. Around 30 golden
  // questions is enough to cross that. Flush before exiting.
  //
  // process.exitCode alone (letting the process end naturally) is not an option:
  // src/lib/db/client.ts opens a postgres client with no idle_timeout, so the
  // event loop never drains and the command would hang.
  await new Promise<void>((resolve) => { process.stdout.write("", () => resolve()); });
  process.exit(code);
}

void main();
