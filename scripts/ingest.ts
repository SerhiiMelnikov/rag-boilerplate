import "dotenv/config";
import { readFile } from "node:fs/promises";
import { ingestDocument } from "@/lib/rag/ingest";
import { scanDirs } from "@/lib/rag/scan-dir";
import { getVectorStore, getDocumentRepo } from "@/lib/vectorstore";
import { getRuntimeSettings } from "@/lib/config/settings-service";
import { createWorkspaceRepo } from "@/lib/workspaces/repo";

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: npm run ingest -- <path-to-file-or-folder>");
    process.exit(1);
  }
  const documentRepo = getDocumentRepo();
  const vectorStore = getVectorStore();
  const settings = await getRuntimeSettings();
  const workspaceRepo = createWorkspaceRepo();
  const { files, errors } = await scanDirs([target]);
  for (const e of errors) console.warn(`Warning: ${e}`);
  console.log(`Found ${files.length} supported file(s).`);
  for (const f of files) {
    const data = await readFile(f.path);
    const result = await ingestDocument(
      { filename: f.path, data, baseDir: f.baseDir, boundary: f.root, source: "directory", contentHash: f.hash },
      { documentRepo, vectorStore, settings, workspaceRepo },
    );
    console.log(`${f.path}: ${result.status} (${result.chunkCount} new, ${result.skipped} skipped)${result.error ? " - " + String(result.error) : ""}`);
  }
  process.exit(0);
}

main();
