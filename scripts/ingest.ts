import "dotenv/config";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { ingestDocument } from "@/lib/rag/ingest";
import { createDrizzleStore } from "@/lib/rag/store";
import { getRuntimeSettings } from "@/lib/config/settings-service";

const SUPPORTED = [".pdf", ".docx", ".md", ".markdown", ".txt"];

// Noise directories to skip during traversal.
const SKIP_DIRS = new Set(["node_modules", ".git"]);

async function collect(path: string): Promise<string[]> {
  let s;
  try {
    s = await stat(path);
  } catch (err) {
    console.warn(`Warning: could not stat "${path}", skipping. (${String(err)})`);
    return [];
  }
  if (s.isFile()) return [path];
  let entries: string[];
  try {
    entries = await readdir(path);
  } catch (err) {
    console.warn(`Warning: could not read directory "${path}", skipping. (${String(err)})`);
    return [];
  }
  const files: string[] = [];
  for (const e of entries) {
    // Skip hidden entries and known noise directories.
    if (e.startsWith(".") || SKIP_DIRS.has(e)) continue;
    files.push(...(await collect(join(path, e))));
  }
  return files;
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: npm run ingest -- <path-to-file-or-folder>");
    process.exit(1);
  }
  const store = createDrizzleStore();
  const settings = await getRuntimeSettings();
  const files = (await collect(target)).filter((f) => SUPPORTED.some((ext) => f.toLowerCase().endsWith(ext)));
  console.log(`Found ${files.length} supported file(s).`);
  for (const file of files) {
    const data = await readFile(file);
    const result = await ingestDocument({ filename: basename(file), data }, { store, settings });
    console.log(`${file}: ${result.status} (${result.chunkCount} new, ${result.skipped} skipped)${result.error ? " - " + String(result.error) : ""}`);
  }
  process.exit(0);
}

main();
