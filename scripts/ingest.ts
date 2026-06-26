import "dotenv/config";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { ingestDocument } from "@/lib/rag/ingest";
import { createDrizzleStore } from "@/lib/rag/store";

const SUPPORTED = [".pdf", ".docx", ".md", ".markdown", ".txt"];

async function collect(path: string): Promise<string[]> {
  const s = await stat(path);
  if (s.isFile()) return [path];
  const entries = await readdir(path);
  const files: string[] = [];
  for (const e of entries) files.push(...(await collect(join(path, e))));
  return files;
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: npm run ingest -- <path-to-file-or-folder>");
    process.exit(1);
  }
  const store = createDrizzleStore();
  const files = (await collect(target)).filter((f) => SUPPORTED.some((ext) => f.toLowerCase().endsWith(ext)));
  console.log(`Found ${files.length} supported file(s).`);
  for (const file of files) {
    const data = await readFile(file);
    const result = await ingestDocument({ filename: basename(file), data }, { store });
    console.log(`${file}: ${result.status} (${result.chunkCount} new, ${result.skipped} skipped)${result.error ? " - " + result.error : ""}`);
  }
  process.exit(0);
}

main();
